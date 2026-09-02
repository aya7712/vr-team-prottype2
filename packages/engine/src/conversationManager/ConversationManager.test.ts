import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { ConversationManager } from './ConversationManager.js';
import { SpeakerSelector } from './SpeakerSelector.js';
import { EndConditionEvaluator } from './EndConditionEvaluator.js';
import { TopicBranchMerger } from './TopicBranchMerger.js';
import type { SessionState } from './types.js';
import { EngineEventBus } from '../logging/EngineEventBus.js';
import { CharacterBrain } from '../character/CharacterBrain.js';
import { EmotionUpdater } from '../character/EmotionUpdater.js';
import { GoalUpdater } from '../character/GoalUpdater.js';
import { IntentUpdater } from '../character/IntentUpdater.js';
import { SpeakingStyleResolver } from '../character/SpeakingStyleResolver.js';
import { RelationshipGraph } from '../relationship/RelationshipGraph.js';
import { RelationshipManager } from '../relationship/RelationshipManager.js';
import { RelationshipUpdater } from '../relationship/RelationshipUpdater.js';
import { TopicClassifier } from '../topic/TopicClassifier.js';
import { TopicParameterUpdater } from '../topic/TopicParameterUpdater.js';
import { TopicContinuationScorer } from '../topic/TopicContinuationScorer.js';
import { TopicTree } from '../topic/TopicTree.js';
import { RhythmTracker } from '../topic/RhythmTracker.js';
import { ConversationStateManager } from '../topic/ConversationStateManager.js';
import { DialogueActCatalog } from '../dialoguePlanner/DialogueActCatalog.js';
import { ScoreCalculator } from '../dialoguePlanner/ScoreCalculator.js';
import { SoftmaxSelector } from '../dialoguePlanner/SoftmaxSelector.js';
import { SpeechExpectationCalculator } from '../dialoguePlanner/SpeechExpectationCalculator.js';
import { DialoguePlanner } from '../dialoguePlanner/DialoguePlanner.js';
import { InMemoryMemoryRepository } from '../memory/InMemoryMemoryRepository.js';
import { MemoryRetriever } from '../memory/MemoryRetriever.js';
import { PromptBuilder } from '../llm/PromptBuilder.js';
import { OutputParser } from '../llm/OutputParser.js';
import type { PromptTemplateLoader } from '../llm/PromptTemplateLoader.js';
import type { LlmClient } from '../llm/LlmClient.js';
import type { CharacterDefRecord } from '../data/types.js';
import type { MemoryItem } from '../types/memory.js';
import type { MemoryLayerPayload } from '../types/events.js';

function makeCharacterDef(
  id: string,
  name: string,
  llm: CharacterDefRecord['llm'] = null,
): CharacterDefRecord {
  return {
    id,
    name,
    furigana: null,
    color: '#000000',
    age: null,
    gender: null,
    firstPerson: '私',
    personality: `${name}の性格`,
    toneSample: null,
    vocabulary: [],
    ngTopics: ['禁止トピック'],
    relationships: [],
    unitContext: null,
    llm,
    rawYamlPath: `${id}.yaml`,
  };
}

function makeCharacterBrain(id: string): CharacterBrain {
  return new CharacterBrain(
    {
      id,
      personality: 'テスト',
      emotion: { label: 'calm', intensity: 0 },
      energy: 0.5,
      curiosity: 0.5,
      currentGoal: '仲良くなる',
      conversationIntent: '',
      speakingStyle: { honorificLevel: 0, jokeTolerance: 0.5, distance: 0.5, addressTerm: '' },
    },
    new EmotionUpdater(),
    new GoalUpdater(),
    new IntentUpdater(),
    new SpeakingStyleResolver(),
  );
}

function makeFakeTemplateLoader(templateContent: string): PromptTemplateLoader {
  return { load: vi.fn().mockReturnValue(templateContent) } as unknown as PromptTemplateLoader;
}

function makeConversationManager(
  llmResponses: string[],
  eventBus?: EngineEventBus,
  characterLlmConfigs?: Partial<Record<'char_a' | 'char_b', CharacterDefRecord['llm']>>,
  memoryItems: MemoryItem[] = [],
): {
  manager: ConversationManager;
  llmClient: LlmClient;
  relationshipGraph: RelationshipGraph;
  promptBuilder: PromptBuilder;
} {
  const relationshipGraph = new RelationshipGraph();
  relationshipGraph.addEdge({
    characterId: 'char_a',
    targetCharacterId: 'char_b',
    type: '幼馴染',
    trust: 0.6,
    intimacy: 0.6,
    respect: 0.5,
    story: [],
  });
  const relationshipManager = new RelationshipManager(relationshipGraph, [
    { characterId: 'char_a', targetCharacterId: 'char_b', addressTerm: '楽' },
    { characterId: 'char_b', targetCharacterId: 'char_a', addressTerm: '宇良' },
  ]);

  const catalog = new DialogueActCatalog();
  const dialoguePlanner = new DialoguePlanner(
    catalog,
    new ScoreCalculator(catalog),
    new SoftmaxSelector(),
    new SpeechExpectationCalculator(),
  );

  const memoryRepo = new InMemoryMemoryRepository(memoryItems);
  const memoryRetriever = new MemoryRetriever(memoryRepo);

  const templateLoader = makeFakeTemplateLoader(
    '{{characterName}}が{{topicLabel}}について{{dialogueAct}}する。',
  );
  const promptBuilder = new PromptBuilder(templateLoader);

  let callIndex = 0;
  const llmClient: LlmClient = {
    complete: vi.fn().mockImplementation(async () => {
      const response = llmResponses[callIndex] ?? llmResponses[llmResponses.length - 1];
      callIndex++;
      return response;
    }),
  };

  const characterDefs = new Map<string, CharacterDefRecord>([
    ['char_a', makeCharacterDef('char_a', '宇良', characterLlmConfigs?.char_a ?? null)],
    ['char_b', makeCharacterDef('char_b', '楽', characterLlmConfigs?.char_b ?? null)],
  ]);

  const characterBrains = new Map([
    ['char_a', makeCharacterBrain('char_a')],
    ['char_b', makeCharacterBrain('char_b')],
  ]);

  const manager = new ConversationManager(
    new TopicClassifier(),
    new TopicParameterUpdater(),
    new TopicContinuationScorer(),
    relationshipManager,
    characterBrains,
    dialoguePlanner,
    memoryRetriever,
    promptBuilder,
    llmClient,
    new OutputParser(),
    characterDefs,
    new SpeakerSelector(),
    new EndConditionEvaluator(),
    new TopicBranchMerger(),
    new RelationshipUpdater(),
    eventBus,
  );
  return { manager, llmClient, relationshipGraph, promptBuilder };
}

function makeSessionState(): SessionState {
  return {
    sessionId: 'session_1',
    participantIds: ['char_a', 'char_b'],
    topicTree: new TopicTree(),
    conversationStateManager: new ConversationStateManager(new RhythmTracker()),
    turnNo: 0,
    recentUtterances: [],
    initialTopic: '最初の話題',
  };
}

describe('ConversationManager', () => {
  it('runTurnは期待するフィールドを持つTurnResultを返す', async () => {
    const { manager } = makeConversationManager(['「やったー！」']);
    const sessionState = makeSessionState();

    const result = await manager.runTurn(sessionState);

    expect(result.sessionId).toBe('session_1');
    expect(result.turnNo).toBe(1);
    expect(['char_a', 'char_b']).toContain(result.speakerId);
    expect(result.targetIds).toEqual([result.speakerId === 'char_a' ? 'char_b' : 'char_a']);
    expect(result.topicId).toBeDefined();
    expect(result.dialogueAct).toBeDefined();
    expect(result.utterance).toBe('やったー！');
    expect(result.createdAt).toBeDefined();
  });

  it('T35: 1発話目のTopicはSessionState.initialTopicから開始する', async () => {
    const { manager } = makeConversationManager(['「やったー！」']);
    const sessionState = makeSessionState();
    sessionState.initialTopic = '夏祭りの思い出';

    const result = await manager.runTurn(sessionState);

    const topic = sessionState.topicTree.getTopic(result.topicId);
    expect(topic).toBeDefined();
    // TopicClassifierは文字bigramのJaccard係数による類似度判定のため、
    // initialTopicと完全一致する発話がなければ「同一Topic」判定にはならず
    // 新規または子Topicとして分類されうる。いずれにせよ最初のTopicの
    // ラベルはinitialTopicそのものであること（「(会話開始)」プレースホルダーに
    // 依存していないこと）を確認する。
    expect(topic?.label).toBe('夏祭りの思い出');
  });

  it('T35: 1発話目のLLMプロンプトに最初のトピックが反映される', async () => {
    const { manager, llmClient } = makeConversationManager(['「やったー！」']);
    const sessionState = makeSessionState();
    sessionState.initialTopic = '夏祭りの思い出';

    await manager.runTurn(sessionState);

    const [prompt] = (llmClient.complete as Mock).mock.calls[0] as [string];
    expect(prompt).toContain('夏祭りの思い出');
  });

  it('runTurnを繰り返すと発話者が交互に切り替わる（2体会話）', async () => {
    const { manager } = makeConversationManager(['「一言目」', '「二言目」', '「三言目」']);
    const sessionState = makeSessionState();

    const first = await manager.runTurn(sessionState);
    const second = await manager.runTurn(sessionState);
    const third = await manager.runTurn(sessionState);

    expect(first.speakerId).toBe('char_a');
    expect(second.speakerId).toBe('char_b');
    expect(third.speakerId).toBe('char_a');
  });

  // T31: 4体・50ターンのE2E結合テストで、RelationshipUpdaterがConversationManagerの
  // ターン実行フローに配線されておらずtrust/intimacyが更新されない不具合が発覚したため、
  // 回帰防止のテストを追加した。
  it('runTurnを繰り返すとRelationshipGraphのtrust/intimacyが更新される（F2.4）', async () => {
    const { manager, relationshipGraph } = makeConversationManager(['「わかるよ、それ」']);
    const sessionState = makeSessionState();
    const before = relationshipGraph.getEdge('char_a', 'char_b');

    // DialogueActは確率的に選ばれ、topicShift/fillSilenceはtrust/intimacyのdeltaが
    // 0のため、1ターンだけでは変化が起きないことがある。複数ターン実行して
    // 「RelationshipUpdaterが全く配線されていない」不具合（T31で発覚）を検出する。
    for (let i = 0; i < 10; i++) {
      await manager.runTurn(sessionState);
    }

    const after = relationshipGraph.getEdge('char_a', 'char_b');
    expect(after).not.toEqual(before);
  });

  it('runSessionはmaxTurns分のTurnResultを例外なく生成する', async () => {
    const { manager } = makeConversationManager(['「発話」']);
    const sessionState = makeSessionState();

    const results = [];
    for await (const turn of manager.runSession(sessionState, 5)) {
      results.push(turn);
    }

    expect(results).toHaveLength(5);
    expect(results.map((r) => r.turnNo)).toEqual([1, 2, 3, 4, 5]);
    expect(sessionState.turnNo).toBe(5);
  });

  it('sessionStateのrecentUtterancesとturnNoがターンごとに更新される', async () => {
    const { manager } = makeConversationManager(['「こんにちは」']);
    const sessionState = makeSessionState();

    await manager.runTurn(sessionState);

    expect(sessionState.recentUtterances).toHaveLength(1);
    expect(sessionState.recentUtterances[0].utterance).toBe('こんにちは');
    expect(sessionState.previousSpeakerId).toBe('char_a');
    expect(sessionState.previousAct).toBeDefined();
  });

  it('runTurnはarchitecture.md 6章の順序で各レイヤーイベントを発行する（F8.3、T13）', async () => {
    const eventBus = new EngineEventBus();
    const { manager } = makeConversationManager(['「やったー！」'], eventBus);
    const sessionState = makeSessionState();

    const emittedEventNames: string[] = [];
    const payloadsByEvent: Record<string, unknown[]> = {};
    const eventNames = [
      'turn:start',
      'layer:topic',
      'layer:relationship',
      'layer:character',
      'layer:dialoguePlanner',
      'layer:memory',
      'layer:llm',
      'turn:complete',
    ] as const;
    for (const name of eventNames) {
      payloadsByEvent[name] = [];
      eventBus.on(name, (payload) => {
        emittedEventNames.push(name);
        payloadsByEvent[name].push(payload);
      });
    }

    const result = await manager.runTurn(sessionState);

    expect(emittedEventNames).toEqual(eventNames);

    expect(payloadsByEvent['turn:start'][0]).toMatchObject({
      turnNo: 1,
      speakerCandidateIds: [result.speakerId],
    });
    expect(payloadsByEvent['layer:topic'][0]).toMatchObject({
      topic: { id: result.topicId },
      conversationState: expect.any(Object),
    });
    expect(payloadsByEvent['layer:relationship'][0]).toMatchObject({
      speakerId: result.speakerId,
      targetId: result.targetIds?.[0],
      edge: expect.any(Object),
    });
    expect(payloadsByEvent['layer:character'][0]).toMatchObject({
      characterState: { id: result.speakerId },
    });
    expect(payloadsByEvent['layer:dialoguePlanner'][0]).toMatchObject({
      scores: expect.any(Array),
      selectedAct: result.dialogueAct,
      expectation: expect.any(Object),
    });
    expect(payloadsByEvent['layer:memory'][0]).toMatchObject({
      retrieved: expect.any(Array),
      filteredOutCount: 0,
    });
    expect(payloadsByEvent['layer:llm'][0]).toMatchObject({
      prompt: expect.any(String),
      rawOutput: '「やったー！」',
    });
    expect(payloadsByEvent['turn:complete'][0]).toEqual(result);
  });

  it('runTurnは発話者のCharacterDefRecord.llmに設定されたmodel/temperatureをllmClientへ渡す', async () => {
    const { manager, llmClient } = makeConversationManager(
      ['「一言目」', '「二言目」'],
      undefined,
      {
        char_a: { provider: 'together', model: 'model-a', temperature: 0.3 },
        char_b: { provider: 'together', model: 'model-b', temperature: 0.9 },
      },
    );
    const sessionState = makeSessionState();

    const first = await manager.runTurn(sessionState);
    const second = await manager.runTurn(sessionState);

    expect(first.speakerId).toBe('char_a');
    expect(llmClient.complete).toHaveBeenNthCalledWith(1, expect.any(String), {
      model: 'model-a',
      temperature: 0.3,
    });
    expect(second.speakerId).toBe('char_b');
    expect(llmClient.complete).toHaveBeenNthCalledWith(2, expect.any(String), {
      model: 'model-b',
      temperature: 0.9,
    });
  });

  // Issue #9: MemoryRetriever/MemoryRepository側の不具合でowner !== speakerIdの記憶
  // （他人の思い出）が混ざって返ってきても、buildPrompt直前の最終ガードでLLMへの
  // 実混入を防ぐことを確認する回帰テスト。
  it('Issue #9: owner !== speakerIdの記憶はLLMへ渡さず、layer:memoryのfilteredOutCountに計上する', async () => {
    const eventBus = new EngineEventBus();
    const othersMemory: MemoryItem = {
      id: 'mem_other_owner',
      source: 'preset',
      owner: 'char_b',
      participants: ['char_a'],
      summary: '除外されるべき他人視点の思い出テキスト',
      tags: [],
      importance: 1,
      shareable: true,
    };
    const { manager, promptBuilder } = makeConversationManager(['「うん」'], eventBus, undefined, [
      othersMemory,
    ]);
    // テンプレート文字列自体は{{retrievedMemory}}を使わない簡易テンプレート
    // （makeFakeTemplateLoader）のため、最終ガードが効いているかは実際に
    // PromptBuilder.buildへ渡された変数（vars.retrievedMemory）で検証する。
    const buildSpy = vi.spyOn(promptBuilder, 'build');
    const sessionState = makeSessionState();

    const memoryPayloads: MemoryLayerPayload[] = [];
    eventBus.on('layer:memory', (payload) => memoryPayloads.push(payload as MemoryLayerPayload));

    const result = await manager.runTurn(sessionState);
    expect(result.speakerId).toBe('char_a');

    // MemoryRetriever自体は変更していないため、`retrieved`には不一致の記憶がそのまま含まれる
    // （＝MemoryRetriever/MemoryRepository側の不具合を再現できている）。
    expect(memoryPayloads).toHaveLength(1);
    expect(memoryPayloads[0].retrieved.some((m) => m.id === 'mem_other_owner')).toBe(true);
    expect(memoryPayloads[0].filteredOutCount).toBe(1);

    // 最終ガードにより、PromptBuilder.buildへ渡されるretrievedMemory変数には
    // 他人の思い出の本文が含まれない（このtargetIdでは他に候補が無いため'(なし)'になる）。
    const [, vars] = buildSpy.mock.calls[0] as [string, Record<string, string>];
    expect(vars.retrievedMemory).toBe('(なし)');
  });
});

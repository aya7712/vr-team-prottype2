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
import type { SpeakerBalanceAdvisor } from '../llm/SpeakerBalanceAdvisor.js';
import type { CharacterDefRecord } from '../data/types.js';

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
  speakerBalanceAdvisor?: SpeakerBalanceAdvisor,
): { manager: ConversationManager; llmClient: LlmClient; relationshipGraph: RelationshipGraph } {
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

  const memoryRepo = new InMemoryMemoryRepository([]);
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
    // Issue #16対応（plan-c、T44）: SpeakerBalanceAdvisorは参加者が3名以上の場合のみ
    // 呼ばれる（2名では常に交互発話になり判定結果が結果に影響しえないため、
    // ConversationManager.runTurn側で3名未満は呼び出し自体をスキップする）。
    // そのテストのために3人目を追加した（既存の2人構成のテストには影響しない。
    // sessionState.participantIdsに含めない限りSpeakerSelectorの候補にならないため）。
    ['char_c', makeCharacterDef('char_c', '理久', null)],
  ]);

  const characterBrains = new Map([
    ['char_a', makeCharacterBrain('char_a')],
    ['char_b', makeCharacterBrain('char_b')],
    ['char_c', makeCharacterBrain('char_c')],
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
    speakerBalanceAdvisor,
  );
  return { manager, llmClient, relationshipGraph };
}

function makeSessionState(participantIds: string[] = ['char_a', 'char_b']): SessionState {
  return {
    sessionId: 'session_1',
    participantIds,
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

  // Issue #16対応（plan-c、T44）: SpeakerBalanceAdvisorによる発話バランス判定の
  // ConversationManagerへの配線を確認する。SpeakerBalanceAdvisor自体の判定・
  // フォールバックロジックはSpeakerBalanceAdvisor.test.tsで、SpeakerSelectorの
  // スコアリングへの反映はSpeakerSelector.test.tsで個別に検証済みのため、ここでは
  // ConversationManagerが判定結果を正しく計算・伝播しているかのみを確認する。
  describe('SpeakerBalanceAdvisor（発話バランス判定）の配線', () => {
    it('layer:speakerBalanceイベントのpayloadに判定結果が反映される', async () => {
      const eventBus = new EngineEventBus();
      const speakerBalanceAdvisor = {
        advise: vi.fn().mockResolvedValue({
          justified: false,
          recommendedSpeakerId: 'char_b',
          reason: 'char_aばかり話している',
          prompt: 'speaker-balance-prompt',
          rawOutput: 'raw-advisor-output',
        }),
      } as unknown as SpeakerBalanceAdvisor;
      const { manager } = makeConversationManager(
        ['「一言目」'],
        eventBus,
        undefined,
        speakerBalanceAdvisor,
      );
      // SpeakerBalanceAdvisorは参加者3名以上でのみ呼ばれる（2体会話では常に交互発話に
      // なり判定結果が影響しえないため、ConversationManager.runTurn側でスキップされる）。
      const sessionState = makeSessionState(['char_a', 'char_b', 'char_c']);

      let payload: unknown;
      eventBus.on('layer:speakerBalance', (p) => {
        payload = p;
      });
      await manager.runTurn(sessionState);

      expect(payload).toEqual({
        prompt: 'speaker-balance-prompt',
        rawOutput: 'raw-advisor-output',
        justified: false,
        recommendedSpeakerId: 'char_b',
        reason: 'char_aばかり話している',
        error: undefined,
      });
    });

    it('layer:speakerBalanceは、turn:startの直後・他のlayer:*イベントより前に発行される', async () => {
      const eventBus = new EngineEventBus();
      const speakerBalanceAdvisor = {
        advise: vi.fn().mockResolvedValue({
          justified: true,
          recommendedSpeakerId: null,
          reason: '',
          prompt: 'p',
          rawOutput: 'r',
        }),
      } as unknown as SpeakerBalanceAdvisor;
      const { manager } = makeConversationManager(
        ['「一言目」'],
        eventBus,
        undefined,
        speakerBalanceAdvisor,
      );
      const sessionState = makeSessionState(['char_a', 'char_b', 'char_c']);

      const emittedEventNames: string[] = [];
      for (const name of ['turn:start', 'layer:speakerBalance', 'layer:topic'] as const) {
        eventBus.on(name, () => emittedEventNames.push(name));
      }
      await manager.runTurn(sessionState);

      expect(emittedEventNames).toEqual(['turn:start', 'layer:speakerBalance', 'layer:topic']);
    });

    it('SpeakerSelector.selectNextへspeakerBalanceAdvisorの判定結果が渡される', async () => {
      const speakerBalanceAdvisor = {
        advise: vi.fn().mockResolvedValue({
          justified: true,
          recommendedSpeakerId: 'char_b',
          reason: 'reason',
          prompt: 'p',
          rawOutput: 'r',
        }),
      } as unknown as SpeakerBalanceAdvisor;
      const { manager } = makeConversationManager(
        ['「一言目」'],
        undefined,
        undefined,
        speakerBalanceAdvisor,
      );
      const sessionState = makeSessionState(['char_a', 'char_b', 'char_c']);

      const selectNextSpy = vi.spyOn(SpeakerSelector.prototype, 'selectNext');
      await manager.runTurn(sessionState);

      expect(selectNextSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          speakerBalanceAdvice: { justified: true, recommendedSpeakerId: 'char_b' },
        }),
      );
      selectNextSpy.mockRestore();
    });

    it('speakerBalanceAdvisor.adviseに、話者選択の直前時点の参加者一覧・直近発話回数・直近の会話が渡される', async () => {
      const speakerBalanceAdvisor = {
        advise: vi.fn().mockResolvedValue({
          justified: false,
          recommendedSpeakerId: null,
          reason: '',
          prompt: 'p',
          rawOutput: 'r',
        }),
      } as unknown as SpeakerBalanceAdvisor;
      const { manager } = makeConversationManager(
        ['「一言目」', '「二言目」'],
        undefined,
        undefined,
        speakerBalanceAdvisor,
      );
      const sessionState = makeSessionState(['char_a', 'char_b', 'char_c']);

      await manager.runTurn(sessionState);
      await manager.runTurn(sessionState);

      const secondCallInput = (speakerBalanceAdvisor.advise as Mock).mock.calls[1][0] as {
        participants: { characterId: string; name: string; recentSpeakCount: number }[];
        recentDialogue: string;
      };
      expect(secondCallInput.participants).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ characterId: 'char_a', name: '宇良' }),
          expect.objectContaining({ characterId: 'char_b', name: '楽' }),
        ]),
      );
      expect(secondCallInput.recentDialogue).toContain('一言目');
    });

    it('2ターン目以降、speakerBalanceAdvisor.adviseには直前の話者のCharacterDefRecord.llm.modelが渡される', async () => {
      const speakerBalanceAdvisor = {
        advise: vi.fn().mockResolvedValue({
          justified: false,
          recommendedSpeakerId: null,
          reason: '',
          prompt: 'p',
          rawOutput: 'r',
        }),
      } as unknown as SpeakerBalanceAdvisor;
      const { manager } = makeConversationManager(
        ['「一言目」', '「二言目」'],
        undefined,
        { char_a: { provider: 'together', model: 'model-a', temperature: 0.3 } },
        speakerBalanceAdvisor,
      );
      const sessionState = makeSessionState(['char_a', 'char_b', 'char_c']);

      await manager.runTurn(sessionState);
      await manager.runTurn(sessionState);

      expect(speakerBalanceAdvisor.advise).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ model: 'model-a' }),
      );
    });

    it('speakerBalanceAdvisorを指定しない場合、既定のSpeakerBalanceAdvisorが使われ発話生成が失敗しない', async () => {
      // 既定のSpeakerBalanceAdvisorは実プロンプトテンプレート(speakerBalance/advisor)を
      // 使うが、このテスト群のfakeテンプレートローダーはテンプレート名を無視して
      // 固定文字列（プレースホルダーが異なる）を返すため、既定advisor内部のプロンプト構築は
      // 失敗し、SpeakerBalanceAdvisor.advise()のフォールバック（判定なし）が働く。
      // ConversationManager.runTurn自体が例外を投げずに完了することを確認する
      // （デフォルト値配線の回帰防止）。
      const { manager } = makeConversationManager(['「一言目」', '「二言目」']);
      const sessionState = makeSessionState(['char_a', 'char_b', 'char_c']);

      const first = await manager.runTurn(sessionState);
      const second = await manager.runTurn(sessionState);

      expect(first.utterance).toBe('一言目');
      expect(second.utterance).toBe('二言目');
    });

    // 自己レビュー（code-reviewスキル）指摘への対応の回帰防止テスト: 参加者が2名以下の
    // 場合、SpeakerSelector.selectNextは直前の話者以外の候補が1名しかないため
    // speakerBalanceAdviceを一切参照せず即座に返す（SpeakerSelector.ts参照）。つまり
    // 2体会話ではSpeakerBalanceAdvisorの判定結果が結果に影響しえないため、無駄な
    // 追加LLM呼び出しを避けるべく、ConversationManager.runTurnはそもそも呼び出し自体を
    // スキップする。
    it('参加者が2名以下の場合、speakerBalanceAdvisor.adviseは呼ばれない', async () => {
      const speakerBalanceAdvisor = {
        advise: vi.fn().mockResolvedValue({
          justified: false,
          recommendedSpeakerId: null,
          reason: '',
          prompt: 'p',
          rawOutput: 'r',
        }),
      } as unknown as SpeakerBalanceAdvisor;
      const { manager } = makeConversationManager(
        ['「一言目」', '「二言目」'],
        undefined,
        undefined,
        speakerBalanceAdvisor,
      );
      const sessionState = makeSessionState(['char_a', 'char_b']);

      await manager.runTurn(sessionState);
      await manager.runTurn(sessionState);

      expect(speakerBalanceAdvisor.advise).not.toHaveBeenCalled();
    });
  });
});

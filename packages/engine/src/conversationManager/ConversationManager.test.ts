import { describe, expect, it, vi } from 'vitest';
import { ConversationManager } from './ConversationManager.js';
import type { SessionState } from './types.js';
import { CharacterBrain } from '../character/CharacterBrain.js';
import { EmotionUpdater } from '../character/EmotionUpdater.js';
import { GoalUpdater } from '../character/GoalUpdater.js';
import { IntentUpdater } from '../character/IntentUpdater.js';
import { SpeakingStyleResolver } from '../character/SpeakingStyleResolver.js';
import { RelationshipGraph } from '../relationship/RelationshipGraph.js';
import { RelationshipManager } from '../relationship/RelationshipManager.js';
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

function makeCharacterDef(id: string, name: string): CharacterDefRecord {
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
    llm: null,
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

function makeConversationManager(llmResponses: string[]): ConversationManager {
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

  const templateLoader = makeFakeTemplateLoader('{{characterName}}が{{dialogueAct}}する。');
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
    ['char_a', makeCharacterDef('char_a', '宇良')],
    ['char_b', makeCharacterDef('char_b', '楽')],
  ]);

  const characterBrains = new Map([
    ['char_a', makeCharacterBrain('char_a')],
    ['char_b', makeCharacterBrain('char_b')],
  ]);

  return new ConversationManager(
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
  );
}

function makeSessionState(): SessionState {
  return {
    sessionId: 'session_1',
    participantIds: ['char_a', 'char_b'],
    topicTree: new TopicTree(),
    conversationStateManager: new ConversationStateManager(new RhythmTracker()),
    turnNo: 0,
    recentUtterances: [],
  };
}

describe('ConversationManager', () => {
  it('runTurnは期待するフィールドを持つTurnResultを返す', async () => {
    const manager = makeConversationManager(['「やったー！」']);
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

  it('runTurnを繰り返すと発話者が交互に切り替わる（2体会話）', async () => {
    const manager = makeConversationManager(['「一言目」', '「二言目」', '「三言目」']);
    const sessionState = makeSessionState();

    const first = await manager.runTurn(sessionState);
    const second = await manager.runTurn(sessionState);
    const third = await manager.runTurn(sessionState);

    expect(first.speakerId).toBe('char_a');
    expect(second.speakerId).toBe('char_b');
    expect(third.speakerId).toBe('char_a');
  });

  it('runSessionはmaxTurns分のTurnResultを例外なく生成する', async () => {
    const manager = makeConversationManager(['「発話」']);
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
    const manager = makeConversationManager(['「こんにちは」']);
    const sessionState = makeSessionState();

    await manager.runTurn(sessionState);

    expect(sessionState.recentUtterances).toHaveLength(1);
    expect(sessionState.recentUtterances[0].utterance).toBe('こんにちは');
    expect(sessionState.previousSpeakerId).toBe('char_a');
    expect(sessionState.previousAct).toBeDefined();
  });
});

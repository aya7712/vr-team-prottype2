import { describe, expect, it } from 'vitest';
import { DialoguePlanner } from './DialoguePlanner.js';
import { DialogueActCatalog } from './DialogueActCatalog.js';
import { ScoreCalculator } from './ScoreCalculator.js';
import { SoftmaxSelector } from './SoftmaxSelector.js';
import { SpeechExpectationCalculator } from './SpeechExpectationCalculator.js';
import type { PlanningContext } from './types.js';
import type { CharacterState } from '../types/character.js';
import type { RelationshipContext } from '../relationship/types.js';
import type { Topic, ConversationState } from '../types/topic.js';

function makeContext(): PlanningContext {
  const speaker: CharacterState = {
    id: 'char_a',
    personality: 'テスト',
    emotion: { label: 'calm', intensity: 0 },
    energy: 0.5,
    curiosity: 0.5,
    currentGoal: '仲良くなる',
    conversationIntent: '',
    speakingStyle: { honorificLevel: 0, jokeTolerance: 0.5, distance: 0.5, addressTerm: '' },
  };
  const relationship: RelationshipContext = {
    edge: {
      characterId: 'char_a',
      targetCharacterId: 'char_b',
      type: '幼馴染',
      trust: 0.5,
      intimacy: 0.5,
      respect: 0.5,
      story: [],
    },
    addressTerm: '楽',
    honorificLevel: 0.2,
    jokeTolerance: 0.5,
    distance: 0.3,
  };
  const topic: Topic = {
    id: 'topic_1',
    label: 'テスト',
    depth: 0,
    energy: 0.5,
    novelty: 0.5,
    life: 0.5,
    unresolved: false,
  };
  const conversationState: ConversationState = {
    currentTopicId: 'topic_1',
    atmosphere: 0.5,
    silenceRisk: 0,
    excitement: 0.5,
    elapsedTurns: 0,
    unresolvedQuestions: [],
    rhythm: [],
  };
  return { speaker, relationship, topic, conversationState, previousAct: 'question' };
}

function makePlanner(): DialoguePlanner {
  const catalog = new DialogueActCatalog();
  return new DialoguePlanner(
    catalog,
    new ScoreCalculator(catalog),
    new SoftmaxSelector(),
    new SpeechExpectationCalculator(),
  );
}

describe('DialoguePlanner', () => {
  it('planNextはact/scores/expectationを返す', () => {
    const planner = makePlanner();
    const result = planner.planNext(makeContext());

    expect(result.act).toBeDefined();
    expect(result.scores).toHaveLength(10);
    expect(result.expectation.expectedActs.length).toBeGreaterThan(0);
  });

  it('同一入力を複数回実行すると選択されるActに揺らぎが出る（F5.4）', () => {
    const planner = makePlanner();
    const context = makeContext();
    const selectedActs = new Set<string>();
    for (let i = 0; i < 100; i++) {
      selectedActs.add(planner.planNext(context).act);
    }
    expect(selectedActs.size).toBeGreaterThan(1);
  });
});

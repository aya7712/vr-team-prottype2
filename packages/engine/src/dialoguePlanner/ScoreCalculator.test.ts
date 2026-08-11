import { describe, expect, it } from 'vitest';
import { DialogueActCatalog } from './DialogueActCatalog.js';
import { ScoreCalculator } from './ScoreCalculator.js';
import type { PlanningContext } from './types.js';
import type { CharacterState } from '../types/character.js';
import type { RelationshipContext } from '../relationship/types.js';
import type { Topic, ConversationState } from '../types/topic.js';

function makeCharacterState(overrides: Partial<CharacterState> = {}): CharacterState {
  return {
    id: 'char_a',
    personality: 'テスト',
    emotion: { label: 'calm', intensity: 0 },
    energy: 0.5,
    curiosity: 0.5,
    currentGoal: '仲良くなる',
    conversationIntent: '',
    speakingStyle: { honorificLevel: 0, jokeTolerance: 0.5, distance: 0.5, addressTerm: '' },
    ...overrides,
  };
}

function makeRelationshipContext(
  overrides: Partial<RelationshipContext> = {},
): RelationshipContext {
  return {
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
    ...overrides,
  };
}

function makeTopic(overrides: Partial<Topic> = {}): Topic {
  return {
    id: 'topic_1',
    label: 'テスト',
    depth: 0,
    energy: 0.5,
    novelty: 0.5,
    life: 0.5,
    unresolved: false,
    ...overrides,
  };
}

function makeConversationState(overrides: Partial<ConversationState> = {}): ConversationState {
  return {
    currentTopicId: 'topic_1',
    atmosphere: 0.5,
    silenceRisk: 0,
    excitement: 0.5,
    elapsedTurns: 0,
    unresolvedQuestions: [],
    rhythm: [],
    ...overrides,
  };
}

function makeContext(overrides: Partial<PlanningContext> = {}): PlanningContext {
  return {
    speaker: makeCharacterState(),
    relationship: makeRelationshipContext(),
    topic: makeTopic(),
    conversationState: makeConversationState(),
    ...overrides,
  };
}

describe('ScoreCalculator', () => {
  it('Score(act) = BaseWeight × 各Modifierの乗算になる（features.md F5.3）', () => {
    const catalog = new DialogueActCatalog();
    const calculator = new ScoreCalculator(catalog);
    const scores = calculator.calculate(makeContext());

    const questionScore = scores.find((s) => s.act === 'question');
    expect(questionScore).toBeDefined();
    const expected =
      questionScore!.baseWeight *
      questionScore!.modifiers.personality *
      questionScore!.modifiers.relationship *
      questionScore!.modifiers.topic *
      questionScore!.modifiers.emotion *
      questionScore!.modifiers.context;
    expect(questionScore!.score).toBeCloseTo(expected);
  });

  it('全Actについてスコアを算出する', () => {
    const catalog = new DialogueActCatalog();
    const calculator = new ScoreCalculator(catalog);
    const scores = calculator.calculate(makeContext());
    expect(scores).toHaveLength(10);
  });

  it('curiosityが高いキャラクターはquestion/deepDiveのスコアが上がる', () => {
    const catalog = new DialogueActCatalog();
    const calculator = new ScoreCalculator(catalog);

    const lowCuriosity = calculator.calculate(
      makeContext({ speaker: makeCharacterState({ curiosity: 0.1 }) }),
    );
    const highCuriosity = calculator.calculate(
      makeContext({ speaker: makeCharacterState({ curiosity: 0.9 }) }),
    );

    const lowScore = lowCuriosity.find((s) => s.act === 'question')!.score;
    const highScore = highCuriosity.find((s) => s.act === 'question')!.score;
    expect(highScore).toBeGreaterThan(lowScore);
  });

  it('スコアは負にならない（0でクランプされる）', () => {
    const catalog = new DialogueActCatalog();
    const calculator = new ScoreCalculator(catalog);
    const scores = calculator.calculate(
      makeContext({
        speaker: makeCharacterState({ emotion: { label: 'hurt', intensity: 1 } }),
        relationship: makeRelationshipContext({ honorificLevel: 1 }),
      }),
    );
    expect(scores.every((s) => s.score >= 0)).toBe(true);
  });
});

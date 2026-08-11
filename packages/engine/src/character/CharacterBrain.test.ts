import { describe, expect, it } from 'vitest';
import { CharacterBrain } from './CharacterBrain.js';
import { EmotionUpdater } from './EmotionUpdater.js';
import { GoalUpdater } from './GoalUpdater.js';
import { IntentUpdater } from './IntentUpdater.js';
import { SpeakingStyleResolver } from './SpeakingStyleResolver.js';
import type { CharacterState } from '../types/character.js';
import type { RelationshipContext } from '../relationship/types.js';

function makeInitialState(): CharacterState {
  return {
    id: 'char_a',
    personality: 'テスト',
    emotion: { label: 'calm', intensity: 0 },
    energy: 0.5,
    curiosity: 0.5,
    currentGoal: '自慢する',
    conversationIntent: '',
    speakingStyle: { honorificLevel: 0, jokeTolerance: 0.5, distance: 0.5, addressTerm: '' },
  };
}

function makeBrain(state = makeInitialState()): CharacterBrain {
  return new CharacterBrain(
    state,
    new EmotionUpdater(),
    new GoalUpdater(),
    new IntentUpdater(),
    new SpeakingStyleResolver(),
  );
}

describe('CharacterBrain', () => {
  it('感情→Goal→Intentの順で状態を更新する（features.md F1.2）', () => {
    const brain = makeBrain();
    const result = brain.updateAfterTurn({ receivedAct: 'deny', fromCharacterId: 'char_b' });

    // deny -> emotion: hurt(0.2)。強度<0.5なのでgoalは変化しない。
    expect(result.emotion).toEqual({ label: 'hurt', intensity: 0.2 });
    expect(result.currentGoal).toBe('自慢する');
    expect(result.conversationIntent).toBe('弁明する');
  });

  it('繰り返し否定されると強度が閾値を超えgoalも切り替わる', () => {
    const brain = makeBrain();
    brain.updateAfterTurn({ receivedAct: 'deny', fromCharacterId: 'char_b' });
    brain.updateAfterTurn({ receivedAct: 'deny', fromCharacterId: 'char_b' });
    const result = brain.updateAfterTurn({ receivedAct: 'deny', fromCharacterId: 'char_b' });

    expect(result.emotion.label).toBe('hurt');
    expect(result.emotion.intensity).toBeCloseTo(0.6);
    expect(result.currentGoal).toBe('仲良くなる');
  });

  it('applyRelationshipContextでspeakingStyleのみが更新される', () => {
    const brain = makeBrain();
    const before = brain.getState();

    const relCtx: RelationshipContext = {
      edge: {
        characterId: 'char_a',
        targetCharacterId: 'char_b',
        type: '幼馴染',
        trust: 0.8,
        intimacy: 0.7,
        respect: 0.6,
        story: [],
      },
      addressTerm: '楽',
      honorificLevel: 0,
      jokeTolerance: 0.9,
      distance: 0.2,
    };
    brain.applyRelationshipContext(relCtx);
    const after = brain.getState();

    expect(after.speakingStyle).toEqual({
      honorificLevel: 0,
      jokeTolerance: 0.9,
      distance: 0.2,
      addressTerm: '楽',
    });
    expect(after.emotion).toEqual(before.emotion);
    expect(after.currentGoal).toBe(before.currentGoal);
  });

  it('getStateは最新の状態を返す', () => {
    const brain = makeBrain();
    brain.updateAfterTurn({ receivedAct: 'empathy', fromCharacterId: 'char_b' });
    expect(brain.getState().emotion.label).toBe('happy');
  });
});

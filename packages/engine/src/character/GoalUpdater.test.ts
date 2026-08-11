import { describe, expect, it } from 'vitest';
import { GoalUpdater } from './GoalUpdater.js';
import type { CharacterState } from '../types/character.js';

function makeState(overrides: Partial<CharacterState> = {}): CharacterState {
  return {
    id: 'char_a',
    personality: 'テスト',
    emotion: { label: 'calm', intensity: 0 },
    energy: 0.5,
    curiosity: 0.5,
    currentGoal: '自慢する',
    conversationIntent: '',
    speakingStyle: { honorificLevel: 0, jokeTolerance: 0.5, distance: 0.5, addressTerm: '' },
    ...overrides,
  };
}

describe('GoalUpdater', () => {
  const updater = new GoalUpdater();

  it('emotionがhurtで強度が高いと仲良くなる目標に切り替わる', () => {
    const state = makeState({ emotion: { label: 'hurt', intensity: 0.7 } });
    expect(updater.update(state, { receivedAct: 'deny', fromCharacterId: 'char_b' })).toBe(
      '仲良くなる',
    );
  });

  it('emotionがamusedで強度が高いと笑わせる目標に切り替わる', () => {
    const state = makeState({ emotion: { label: 'amused', intensity: 0.6 } });
    expect(updater.update(state, { receivedAct: 'joke', fromCharacterId: 'char_b' })).toBe(
      '笑わせる',
    );
  });

  it('感情強度が閾値未満なら既存の目標を維持する', () => {
    const state = makeState({ emotion: { label: 'hurt', intensity: 0.3 } });
    expect(updater.update(state, { receivedAct: 'deny', fromCharacterId: 'char_b' })).toBe(
      '自慢する',
    );
  });

  it('currentGoalが未設定なら既定値を返す', () => {
    const state = makeState({ currentGoal: '' });
    expect(updater.update(state, { receivedAct: 'question', fromCharacterId: 'char_b' })).toBe(
      '仲良くなる',
    );
  });
});

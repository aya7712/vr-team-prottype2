import { describe, expect, it } from 'vitest';
import { IntentUpdater } from './IntentUpdater.js';
import type { CharacterState } from '../types/character.js';

function makeState(): CharacterState {
  return {
    id: 'char_a',
    personality: 'テスト',
    emotion: { label: 'calm', intensity: 0 },
    energy: 0.5,
    curiosity: 0.5,
    currentGoal: '仲良くなる',
    conversationIntent: '',
    speakingStyle: { honorificLevel: 0, jokeTolerance: 0.5, distance: 0.5, addressTerm: '' },
  };
}

describe('IntentUpdater', () => {
  const updater = new IntentUpdater();

  it('共感されたら感謝を伝える意図になる', () => {
    expect(updater.update(makeState(), { receivedAct: 'empathy', fromCharacterId: 'char_b' })).toBe(
      '感謝を伝える',
    );
  });

  it('否定されたら弁明する意図になる', () => {
    expect(updater.update(makeState(), { receivedAct: 'deny', fromCharacterId: 'char_b' })).toBe(
      '弁明する',
    );
  });

  it('質問されたら答える意図になる', () => {
    expect(
      updater.update(makeState(), { receivedAct: 'question', fromCharacterId: 'char_b' }),
    ).toBe('答える');
  });
});

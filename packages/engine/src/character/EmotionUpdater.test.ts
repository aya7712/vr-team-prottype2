import { describe, expect, it } from 'vitest';
import { EmotionUpdater } from './EmotionUpdater.js';

describe('EmotionUpdater', () => {
  const updater = new EmotionUpdater();

  it('共感されると感情がhappyになり強度が上がる', () => {
    const result = updater.update(
      { label: 'calm', intensity: 0 },
      { receivedAct: 'empathy', fromCharacterId: 'char_b' },
    );
    expect(result).toEqual({ label: 'happy', intensity: 0.2 });
  });

  it('否定されると感情がhurtになり強度が上がる', () => {
    const result = updater.update(
      { label: 'calm', intensity: 0 },
      { receivedAct: 'deny', fromCharacterId: 'char_b' },
    );
    expect(result).toEqual({ label: 'hurt', intensity: 0.2 });
  });

  it('同じ感情ラベルが連続すると強度が積み上がる', () => {
    const first = updater.update(
      { label: 'calm', intensity: 0 },
      { receivedAct: 'empathy', fromCharacterId: 'char_b' },
    );
    const second = updater.update(first, { receivedAct: 'empathy', fromCharacterId: 'char_b' });
    expect(second).toEqual({ label: 'happy', intensity: 0.4 });
  });

  it('異なる感情ラベルに切り替わると強度はリセットされる', () => {
    const happy = { label: 'happy', intensity: 0.8 };
    const result = updater.update(happy, { receivedAct: 'deny', fromCharacterId: 'char_b' });
    expect(result).toEqual({ label: 'hurt', intensity: 0.2 });
  });

  it('強度は1を超えない', () => {
    const nearMax = { label: 'happy', intensity: 0.95 };
    const result = updater.update(nearMax, { receivedAct: 'empathy', fromCharacterId: 'char_b' });
    expect(result.intensity).toBe(1);
  });
});

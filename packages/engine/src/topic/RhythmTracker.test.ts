import { describe, expect, it } from 'vitest';
import { RhythmTracker } from './RhythmTracker.js';

describe('RhythmTracker', () => {
  it('同一Actが連続していない場合は補正を行わない', () => {
    const tracker = new RhythmTracker();
    tracker.recordAct('question');
    tracker.recordAct('answer');
    expect(tracker.getWeightAdjustments()).toEqual({});
  });

  it('同一Actが連続すると他Actの重みが上がり、当該Actの重みが下がる', () => {
    const tracker = new RhythmTracker();
    tracker.recordAct('question');
    tracker.recordAct('question');

    const adjustments = tracker.getWeightAdjustments();
    expect(adjustments.question).toBeLessThan(0);
    expect(adjustments.answer).toBeGreaterThan(0);
    expect(adjustments.joke).toBeGreaterThan(0);
    expect(adjustments.answer).toBeGreaterThan(adjustments.question ?? 0);
  });

  it('getRecentActsは直近の履歴をウィンドウ幅で保持する', () => {
    const tracker = new RhythmTracker();
    const acts: Array<'question' | 'answer'> = [
      'question',
      'answer',
      'question',
      'answer',
      'question',
      'answer',
    ];
    for (const act of acts) tracker.recordAct(act);

    expect(tracker.getRecentActs()).toHaveLength(5);
    expect(tracker.getRecentActs()).toEqual(['answer', 'question', 'answer', 'question', 'answer']);
  });
});

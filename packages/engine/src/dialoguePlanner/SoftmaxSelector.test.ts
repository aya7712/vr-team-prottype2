import { describe, expect, it } from 'vitest';
import { SoftmaxSelector } from './SoftmaxSelector.js';
import type { DialogueActScore } from '../types/dialogueAct.js';

function makeScores(): DialogueActScore[] {
  return [
    { act: 'question', baseWeight: 1, modifiers: {}, score: 2, probability: 0 },
    { act: 'answer', baseWeight: 1, modifiers: {}, score: 1, probability: 0 },
    { act: 'joke', baseWeight: 1, modifiers: {}, score: 0.5, probability: 0 },
  ];
}

describe('SoftmaxSelector', () => {
  it('toProbabilitiesは確率の合計が1になる', () => {
    const selector = new SoftmaxSelector();
    const result = selector.toProbabilities(makeScores());
    const total = result.reduce((sum, s) => sum + s.probability, 0);
    expect(total).toBeCloseTo(1);
  });

  it('スコアが高いActほど確率も高くなる', () => {
    const selector = new SoftmaxSelector();
    const result = selector.toProbabilities(makeScores());
    const question = result.find((s) => s.act === 'question')!;
    const joke = result.find((s) => s.act === 'joke')!;
    expect(question.probability).toBeGreaterThan(joke.probability);
  });

  it('乱数値に応じて累積確率で選択する（決定的なrandomで検証）', () => {
    const selector = new SoftmaxSelector(1, () => 0);
    const result = selector.select(makeScores());
    // roll=0は最初の累積区間（question）に入る
    expect(result.act).toBe('question');
  });

  it('roll=0.99付近では最後のActが選ばれる', () => {
    const selector = new SoftmaxSelector(1, () => 0.999999);
    const result = selector.select(makeScores());
    expect(result.act).toBe('joke');
  });

  it('最高スコア固定選択ではなく、同一入力を複数回実行すると確率的な揺らぎが出る（F5.4）', () => {
    const selector = new SoftmaxSelector();
    const results = new Set<string>();
    for (let i = 0; i < 200; i++) {
      results.add(selector.select(makeScores()).act);
    }
    // 200回試行すれば、questionだけでなく他のActも選ばれるはず
    expect(results.size).toBeGreaterThan(1);
  });
});

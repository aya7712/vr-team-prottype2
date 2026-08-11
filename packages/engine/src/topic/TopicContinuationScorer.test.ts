import { describe, expect, it } from 'vitest';
import { TopicContinuationScorer } from './TopicContinuationScorer.js';
import type { Topic } from '../types/topic.js';

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

describe('TopicContinuationScorer', () => {
  const scorer = new TopicContinuationScorer();

  it('energy/novelty/emotionalityが高いほどスコアが高い', () => {
    const low = scorer.score(makeTopic({ energy: 0.1, novelty: 0.1, emotionality: 0.1 }));
    const high = scorer.score(makeTopic({ energy: 0.9, novelty: 0.9, emotionality: 0.9 }));
    expect(high).toBeGreaterThan(low);
  });

  it('unresolvedがtrueだとスコアが上がる', () => {
    const resolved = scorer.score(makeTopic({ unresolved: false }));
    const unresolved = scorer.score(makeTopic({ unresolved: true }));
    expect(unresolved).toBeGreaterThan(resolved);
  });

  it('depthが深いほどスコアにペナルティがかかる', () => {
    const shallow = scorer.score(makeTopic({ depth: 0 }));
    const deep = scorer.score(makeTopic({ depth: 5 }));
    expect(deep).toBeLessThan(shallow);
  });

  it('スコアは0〜1にクランプされる', () => {
    const max = scorer.score(
      makeTopic({ energy: 1, novelty: 1, emotionality: 1, unresolved: true }),
    );
    const min = scorer.score(makeTopic({ energy: 0, novelty: 0, emotionality: 0, depth: 100 }));
    expect(max).toBeLessThanOrEqual(1);
    expect(min).toBeGreaterThanOrEqual(0);
  });
});

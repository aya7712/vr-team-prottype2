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

  // Issue #16 (plan-b): 「二人だけの思い出を長く語る」ような正当な偏りは、話題が
  // 未解決のまま継続しているか、深掘りされている状態と一致するという想定のテスト。
  describe('isPairFocusJustifiedByTopic（Issue #16 plan-b）', () => {
    it('unresolvedがtrueなら、depth/scoreに関わらず正当化される', () => {
      const topic = makeTopic({ unresolved: true, depth: 0 });
      expect(scorer.isPairFocusJustifiedByTopic(topic, 0)).toBe(true);
    });

    it('depthが深くcontinuationScoreも高ければ正当化される（深掘りが続いている状態）', () => {
      const topic = makeTopic({ unresolved: false, depth: 3 });
      expect(scorer.isPairFocusJustifiedByTopic(topic, 0.8)).toBe(true);
    });

    it('depthが浅くunresolvedでもなければ正当化されない（雑談的な往復）', () => {
      const topic = makeTopic({ unresolved: false, depth: 0 });
      expect(scorer.isPairFocusJustifiedByTopic(topic, 0.8)).toBe(false);
    });

    it('depthが深くてもcontinuationScoreが低ければ正当化されない', () => {
      const topic = makeTopic({ unresolved: false, depth: 5 });
      expect(scorer.isPairFocusJustifiedByTopic(topic, 0.1)).toBe(false);
    });
  });
});

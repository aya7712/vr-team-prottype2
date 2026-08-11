import type { Topic } from '../types/topic.js';

// F4.4: depth/energy/novelty/emotionality/unresolvedから継続価値を算出する。
// 重み付けの具体的な数値はfeatures.mdに明記されていないため実装者判断で設定した。
const WEIGHTS = {
  energy: 0.35,
  novelty: 0.25,
  emotionality: 0.2,
  unresolvedBonus: 0.2,
  depthPenaltyPerLevel: 0.03,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 話題を継続する価値を算出する（F4.4）。 */
export class TopicContinuationScorer {
  score(topic: Topic): number {
    const raw =
      topic.energy * WEIGHTS.energy +
      topic.novelty * WEIGHTS.novelty +
      (topic.emotionality ?? 0) * WEIGHTS.emotionality +
      (topic.unresolved ? WEIGHTS.unresolvedBonus : 0) -
      topic.depth * WEIGHTS.depthPenaltyPerLevel;

    return clamp(raw, 0, 1);
  }
}

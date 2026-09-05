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

// Issue #16 (plan-b): 「二人だけの思い出を長く語る」ような正当な偏りは、往々にして
// 話題が深掘りされている（depthが深い）か、未解決（unresolved）のまま継続している
// 状態と一致する。閾値の具体的な数値はfeatures.mdに明記が無いため実装者判断で設定した
// （doc/changelog/20260905-003720-content-justified-speaker-balance.md）。continuationScore側の閾値は、WEIGHTS.energy等の重みだけで
// 単純に高エネルギーな話題（depthに関係なく盛り上がっているだけの話題）まで
// 正当化してしまわないよう、depthByPenaltyがある程度効いた状態でもなお高い値を
// 要求する水準（中央値よりやや上）に設定した。
const PAIR_FOCUS_JUSTIFICATION_THRESHOLDS = {
  minDepth: 2,
  minContinuationScore: 0.6,
};

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

  /**
   * 話題の内容（未解決状態・深掘り度合い）から見て、現在の話者ペアへの発話集中が
   * 正当化されるかどうかを判定する（Issue #16 plan-b）。`continuationScore`は
   * 同じ`topic`に対する`score()`の呼び出し結果を渡す想定（ConversationManagerが
   * 既に算出済みの値を再利用し、二重計算を避ける）。
   */
  isPairFocusJustifiedByTopic(topic: Topic, continuationScore: number): boolean {
    if (topic.unresolved) return true;
    return (
      topic.depth >= PAIR_FOCUS_JUSTIFICATION_THRESHOLDS.minDepth &&
      continuationScore >= PAIR_FOCUS_JUSTIFICATION_THRESHOLDS.minContinuationScore
    );
  }
}

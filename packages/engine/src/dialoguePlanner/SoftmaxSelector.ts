import type { DialogueAct, DialogueActScore } from '../types/dialogueAct.js';

const DEFAULT_TEMPERATURE = 1;

/** スコアをSoftmaxで確率分布化し、確率的にサンプリングする（F5.4）。 */
export class SoftmaxSelector {
  constructor(
    private readonly temperature: number = DEFAULT_TEMPERATURE,
    private readonly random: () => number = Math.random,
  ) {}

  // scoresの各要素にprobabilityを設定した新しい配列を返す。
  toProbabilities(scores: DialogueActScore[]): DialogueActScore[] {
    const exponents = scores.map((s) => Math.exp(s.score / this.temperature));
    const total = exponents.reduce((sum, v) => sum + v, 0);

    return scores.map((s, i) => ({
      ...s,
      probability: total === 0 ? 1 / scores.length : exponents[i] / total,
    }));
  }

  // 確率分布に従い1つのActを確率的に選択する（最高スコア固定選択ではない）。
  select(scores: DialogueActScore[]): { act: DialogueAct; scores: DialogueActScore[] } {
    const withProbabilities = this.toProbabilities(scores);

    const roll = this.random();
    let cumulative = 0;
    for (const s of withProbabilities) {
      cumulative += s.probability;
      if (roll < cumulative) {
        return { act: s.act, scores: withProbabilities };
      }
    }
    // 浮動小数点誤差で累積がroll未満のまま終わった場合は最後の候補を返す。
    return { act: withProbabilities[withProbabilities.length - 1].act, scores: withProbabilities };
  }
}

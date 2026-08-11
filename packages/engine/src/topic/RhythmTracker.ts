import type { DialogueAct } from '../types/dialogueAct.js';

const HISTORY_WINDOW = 5;
const REPETITION_THRESHOLD = 2; // 同一Actがこの回数以上連続したら補正を開始する
const OTHER_ACT_BOOST = 0.3;
const REPEATED_ACT_PENALTY = -0.3;

/** 直近Act系列の監視・補正（F4.6）。単調なパターンが続く場合に他Actの選択確率を補正する。 */
export class RhythmTracker {
  private history: DialogueAct[] = [];

  recordAct(act: DialogueAct): void {
    this.history = [...this.history, act].slice(-HISTORY_WINDOW);
  }

  getRecentActs(): DialogueAct[] {
    return [...this.history];
  }

  private getRepeatedAct(): DialogueAct | undefined {
    if (this.history.length < REPETITION_THRESHOLD) return undefined;

    const tail = this.history.slice(-REPETITION_THRESHOLD);
    const [first, ...rest] = tail;
    return rest.every((act) => act === first) ? first : undefined;
  }

  // 同一ActがREPETITION_THRESHOLD回連続した場合、そのAct自身の重みを下げ、
  // 他のActの重みを一律で上げる補正値を返す（F5のScoreCalculatorが利用する想定）。
  getWeightAdjustments(): Partial<Record<DialogueAct, number>> {
    const repeatedAct = this.getRepeatedAct();
    if (!repeatedAct) return {};

    const allActs: DialogueAct[] = [
      'question',
      'answer',
      'empathy',
      'deny',
      'joke',
      'tsukkomi',
      'story',
      'deepDive',
      'topicShift',
      'fillSilence',
    ];

    const adjustments: Partial<Record<DialogueAct, number>> = {};
    for (const act of allActs) {
      adjustments[act] = act === repeatedAct ? REPEATED_ACT_PENALTY : OTHER_ACT_BOOST;
    }
    return adjustments;
  }
}

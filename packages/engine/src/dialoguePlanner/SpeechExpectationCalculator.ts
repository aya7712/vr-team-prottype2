import type { DialogueAct, SpeechExpectation } from '../types/dialogueAct.js';
import { modifierWeightsConfig } from './config/modifierWeightsConfig.js';

const { expectationTable } = modifierWeightsConfig.context;

/**
 * 直前の発話が生成する「次に期待される発話行為」の確率分布を算出する（F5.2）。
 * ContextModifierと同じ`expectationTable`（config/modifierWeights.json）を用いる。
 */
export class SpeechExpectationCalculator {
  calculate(
    previousAct: DialogueAct | undefined,
    targetCharacterIds?: string[],
  ): SpeechExpectation {
    if (!previousAct) {
      return { expectedActs: [], targetCharacterIds };
    }

    const table = expectationTable[previousAct] ?? {};
    const expectedActs = Object.entries(table).map(([act, weight]) => ({
      act: act as DialogueAct,
      weight: weight ?? 0,
    }));

    return { expectedActs, targetCharacterIds };
  }
}

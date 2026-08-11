import type { DialogueAct } from '../../types/dialogueAct.js';
import type { PlanningContext } from '../types.js';
import { modifierWeightsConfig } from '../config/modifierWeightsConfig.js';

const { expectationTable } = modifierWeightsConfig.context;

/**
 * 直前発話との相性（F5.2連携）。expectationTable[previousAct][act]の期待値
 * （0〜1程度）を1.0を中心とした倍率に変換する。previousActが無い、または
 * 期待値が定義されていないActは中立（1.0）とする。
 */
export function resolveContextModifier(act: DialogueAct, context: PlanningContext): number {
  if (!context.previousAct) return 1;

  const expectation = expectationTable[context.previousAct]?.[act];
  if (expectation === undefined) return 1;

  return 0.5 + expectation;
}

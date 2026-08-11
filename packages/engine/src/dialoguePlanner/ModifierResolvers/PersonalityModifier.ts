import type { DialogueAct } from '../../types/dialogueAct.js';
import type { PlanningContext } from '../types.js';
import { modifierWeightsConfig } from '../config/modifierWeightsConfig.js';

const config = modifierWeightsConfig.personality;

/**
 * speakerのenergy/curiosity（F1.1の数値特性）を性格傾向の代理指標として使う。
 * personalityは自由記述文字列（F1.1）でありプログラムから直接扱えないため、
 * 実装者判断で数値特性を代用した（features.md/class-design.mdに明記なし）。
 */
export function resolvePersonalityModifier(act: DialogueAct, context: PlanningContext): number {
  const trait = config.actTrait[act];
  if (!trait) return 1;

  const traitValue = context.speaker[trait];
  return 1 + (traitValue - 0.5) * config.ampFactor;
}

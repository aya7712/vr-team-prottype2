import type { DialogueAct } from '../../types/dialogueAct.js';
import type { PlanningContext } from '../types.js';
import { modifierWeightsConfig } from '../config/modifierWeightsConfig.js';

const config = modifierWeightsConfig.topic;

/** 現在のTopicパラメータ（energy/novelty/life/unresolved）を踏まえたスコア補正（F5.3）。 */
export function resolveTopicModifier(act: DialogueAct, context: PlanningContext): number {
  let modifier = 1;
  const { energy, novelty, life, unresolved } = context.topic;

  if (config.energyNoveltyActs.includes(act)) {
    modifier *= 1 + ((energy + novelty) / 2 - 0.5) * config.ampFactor;
  }
  if (config.lowLifeBoostActs.includes(act)) {
    modifier *= 1 + (0.5 - life) * config.ampFactor;
  }
  if (config.unresolvedBoostActs.includes(act) && unresolved) {
    modifier *= 1 + config.ampFactor * 0.5;
  }

  return modifier;
}

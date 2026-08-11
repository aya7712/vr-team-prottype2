import type { DialogueAct } from '../../types/dialogueAct.js';
import type { PlanningContext } from '../types.js';
import { modifierWeightsConfig } from '../config/modifierWeightsConfig.js';

const config = modifierWeightsConfig.relationship;

/** relationship（RelationshipManager.resolve()の結果）を踏まえたスコア補正（F5.3）。 */
export function resolveRelationshipModifier(act: DialogueAct, context: PlanningContext): number {
  let modifier = 1;
  const { jokeTolerance, honorificLevel, edge } = context.relationship;

  if (config.jokeToleranceActs.includes(act)) {
    modifier *= 1 + (jokeTolerance - 0.5) * config.ampFactor;
  }
  if (config.intimacyActs.includes(act)) {
    modifier *= 1 + (edge.intimacy - 0.5) * config.ampFactor;
  }
  if (config.honorificPenaltyActs.includes(act)) {
    modifier *= 1 - honorificLevel * config.ampFactor;
  }

  return modifier;
}

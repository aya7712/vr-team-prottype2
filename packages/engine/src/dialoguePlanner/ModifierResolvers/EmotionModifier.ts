import type { DialogueAct } from '../../types/dialogueAct.js';
import type { PlanningContext } from '../types.js';
import { modifierWeightsConfig } from '../config/modifierWeightsConfig.js';

const config = modifierWeightsConfig.emotion;

/** speakerの現在のemotion（F1.1）を踏まえたスコア補正（F5.3）。 */
export function resolveEmotionModifier(act: DialogueAct, context: PlanningContext): number {
  const { label, intensity } = context.speaker.emotion;
  const boostedActs = config.actBoostByEmotion[label];
  if (!boostedActs || !boostedActs.includes(act)) return 1;

  return 1 + intensity * config.ampFactor;
}

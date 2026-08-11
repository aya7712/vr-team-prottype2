import type { DialogueActScore } from '../types/dialogueAct.js';
import type { DialogueActCatalog } from './DialogueActCatalog.js';
import type { PlanningContext } from './types.js';
import { resolvePersonalityModifier } from './ModifierResolvers/PersonalityModifier.js';
import { resolveRelationshipModifier } from './ModifierResolvers/RelationshipModifier.js';
import { resolveTopicModifier } from './ModifierResolvers/TopicModifier.js';
import { resolveEmotionModifier } from './ModifierResolvers/EmotionModifier.js';
import { resolveContextModifier } from './ModifierResolvers/ContextModifier.js';

/**
 * 各Dialogue Actのスコアを乗算モデルで算出する（F5.3）。
 * Score(act) = BaseWeight(act) × PersonalityModifier × RelationshipModifier
 *            × TopicModifier × EmotionModifier × ContextModifier
 */
export class ScoreCalculator {
  constructor(private readonly catalog: DialogueActCatalog) {}

  calculate(context: PlanningContext): DialogueActScore[] {
    return this.catalog.listActs().map((act) => {
      const baseWeight = this.catalog.getBaseWeight(act);
      const modifiers = {
        personality: resolvePersonalityModifier(act, context),
        relationship: resolveRelationshipModifier(act, context),
        topic: resolveTopicModifier(act, context),
        emotion: resolveEmotionModifier(act, context),
        context: resolveContextModifier(act, context),
      };

      const score = Object.values(modifiers).reduce(
        (product, modifier) => product * modifier,
        baseWeight,
      );

      return {
        act,
        baseWeight,
        modifiers,
        score: Math.max(0, score),
        probability: 0,
      };
    });
  }
}

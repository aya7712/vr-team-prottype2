import type { SpeakingStyleModifier } from '../types/character.js';
import type { RelationshipContext } from '../relationship/types.js';

/** RelationshipContextをSpeakingStyleModifierへ適用するだけの薄いクラス（F1.3）。 */
export class SpeakingStyleResolver {
  resolve(relCtx: RelationshipContext): SpeakingStyleModifier {
    return {
      honorificLevel: relCtx.honorificLevel,
      jokeTolerance: relCtx.jokeTolerance,
      distance: relCtx.distance,
      addressTerm: relCtx.addressTerm,
    };
  }
}

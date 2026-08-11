import { describe, expect, it } from 'vitest';
import { SpeakingStyleResolver } from './SpeakingStyleResolver.js';
import type { RelationshipContext } from '../relationship/types.js';

describe('SpeakingStyleResolver', () => {
  const resolver = new SpeakingStyleResolver();

  it('RelationshipContextの各フィールドをSpeakingStyleModifierへそのまま写す', () => {
    const relCtx: RelationshipContext = {
      edge: {
        characterId: 'char_a',
        targetCharacterId: 'char_c',
        type: '幼馴染の兄',
        trust: 0.6,
        intimacy: 0.5,
        respect: 0.9,
        story: [],
      },
      addressTerm: '理久兄',
      honorificLevel: 0.4,
      jokeTolerance: 0.3,
      distance: 0.6,
    };

    expect(resolver.resolve(relCtx)).toEqual({
      honorificLevel: 0.4,
      jokeTolerance: 0.3,
      distance: 0.6,
      addressTerm: '理久兄',
    });
  });
});

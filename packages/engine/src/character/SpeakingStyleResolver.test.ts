import { describe, expect, it } from 'vitest';
import { SpeakingStyleResolver } from './SpeakingStyleResolver.js';
import type { RelationshipContext } from '../relationship/types.js';
import type { SpeakingStyleModifier } from '../types/character.js';

describe('SpeakingStyleResolver', () => {
  const resolver = new SpeakingStyleResolver();

  describe('resolve', () => {
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

  describe('describe', () => {
    it('敬語レベル・距離感・冗談許容度が高いほど丁寧・他人行儀・軽口多めの説明になる', () => {
      const style: SpeakingStyleModifier = {
        honorificLevel: 0.9,
        jokeTolerance: 0.9,
        distance: 0.9,
        addressTerm: '',
      };

      const description = resolver.describe(style);

      expect(description).toContain('丁寧語・敬語を崩さずに話す');
      expect(description).toContain('他人行儀な態度を取る');
      expect(description).toContain('軽口や冗談を積極的に交える');
    });

    it('敬語レベル・距離感・冗談許容度が低いほどタメ口・近い距離・冗談控えめの説明になる', () => {
      const style: SpeakingStyleModifier = {
        honorificLevel: 0.1,
        jokeTolerance: 0.1,
        distance: 0.1,
        addressTerm: '',
      };

      const description = resolver.describe(style);

      expect(description).toContain('タメ口中心のくだけた言葉遣いで話す');
      expect(description).toContain('遠慮のない、とても近い距離感で接する');
      expect(description).toContain('冗談はほとんど交えず落ち着いて話す');
    });

    it('中間値では中間的な説明になる', () => {
      const style: SpeakingStyleModifier = {
        honorificLevel: 0.5,
        jokeTolerance: 0.5,
        distance: 0.5,
        addressTerm: '',
      };

      const description = resolver.describe(style);

      expect(description).toContain('ややかしこまった、丁寧寄りの言葉遣いで話す');
      expect(description).toContain('礼儀は保ちつつ、まだ少し距離のある態度を取る');
      expect(description).toContain('時々軽い冗談を挟む程度に留める');
    });

    it('addressTermが設定されている場合は呼び方の説明を含める', () => {
      const style: SpeakingStyleModifier = {
        honorificLevel: 0.4,
        jokeTolerance: 0.3,
        distance: 0.6,
        addressTerm: '理久兄',
      };

      expect(resolver.describe(style)).toContain('相手を「理久兄」と呼ぶ');
    });

    it('addressTermが空文字の場合は呼び方の説明を含めない', () => {
      const style: SpeakingStyleModifier = {
        honorificLevel: 0.4,
        jokeTolerance: 0.3,
        distance: 0.6,
        addressTerm: '',
      };

      expect(resolver.describe(style)).not.toContain('と呼ぶ');
    });
  });
});

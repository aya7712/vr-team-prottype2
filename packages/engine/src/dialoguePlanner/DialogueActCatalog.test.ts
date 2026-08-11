import { describe, expect, it } from 'vitest';
import { DialogueActCatalog } from './DialogueActCatalog.js';

describe('DialogueActCatalog', () => {
  it('10種類のDialogue Actを列挙する', () => {
    const catalog = new DialogueActCatalog();
    expect(catalog.listActs()).toHaveLength(10);
  });

  it('各Actの基本重みを取得できる', () => {
    const catalog = new DialogueActCatalog();
    expect(catalog.getBaseWeight('question')).toBeGreaterThan(0);
    expect(catalog.getBaseWeight('fillSilence')).toBeGreaterThan(0);
  });

  it('コンストラクタでbaseWeightsを注入できる', () => {
    const catalog = new DialogueActCatalog({
      question: 5,
      answer: 1,
      empathy: 1,
      deny: 1,
      joke: 1,
      tsukkomi: 1,
      story: 1,
      deepDive: 1,
      topicShift: 1,
      fillSilence: 1,
    });
    expect(catalog.getBaseWeight('question')).toBe(5);
  });
});

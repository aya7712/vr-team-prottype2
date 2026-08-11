import { describe, expect, it } from 'vitest';
import { SpeechExpectationCalculator } from './SpeechExpectationCalculator.js';

describe('SpeechExpectationCalculator', () => {
  const calculator = new SpeechExpectationCalculator();

  it('previousActが無い場合は空の期待値を返す', () => {
    const result = calculator.calculate(undefined);
    expect(result.expectedActs).toEqual([]);
  });

  it('質問の後は回答が高い期待値を持つ（features.md F5.2の例）', () => {
    const result = calculator.calculate('question');
    const answerExpectation = result.expectedActs.find((e) => e.act === 'answer');
    expect(answerExpectation).toBeDefined();
    expect(answerExpectation!.weight).toBeGreaterThan(0.5);
  });

  it('targetCharacterIdsを付帯情報として保持する（F5.2）', () => {
    const result = calculator.calculate('question', ['char_b']);
    expect(result.targetCharacterIds).toEqual(['char_b']);
  });
});

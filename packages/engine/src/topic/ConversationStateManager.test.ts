import { describe, expect, it } from 'vitest';
import { ConversationStateManager } from './ConversationStateManager.js';
import { RhythmTracker } from './RhythmTracker.js';

describe('ConversationStateManager', () => {
  it('初期状態を返す', () => {
    const manager = new ConversationStateManager(new RhythmTracker());
    const state = manager.getState();
    expect(state.elapsedTurns).toBe(0);
    expect(state.rhythm).toEqual([]);
  });

  it('updateAfterTurnでelapsedTurns/rhythmが更新される', () => {
    const manager = new ConversationStateManager(new RhythmTracker());
    const state = manager.updateAfterTurn('empathy', 0.8);
    expect(state.elapsedTurns).toBe(1);
    expect(state.rhythm).toEqual(['empathy']);
  });

  it('questionでunresolvedQuestionsが増え、answerで減る', () => {
    const manager = new ConversationStateManager(new RhythmTracker());
    const afterQuestion = manager.updateAfterTurn('question', 0.5);
    expect(afterQuestion.unresolvedQuestions).toHaveLength(1);

    const afterAnswer = manager.updateAfterTurn('answer', 0.5);
    expect(afterAnswer.unresolvedQuestions).toHaveLength(0);
  });

  it('ポジティブなActでatmosphereが上がり、denyで下がる', () => {
    const manager = new ConversationStateManager(new RhythmTracker());
    const afterEmpathy = manager.updateAfterTurn('empathy', 0.5);
    expect(afterEmpathy.atmosphere).toBeGreaterThan(0.5);

    const afterDeny = manager.updateAfterTurn('deny', 0.5);
    expect(afterDeny.atmosphere).toBeLessThan(afterEmpathy.atmosphere);
  });

  it('fillSilenceでsilenceRiskが上がる', () => {
    const manager = new ConversationStateManager(new RhythmTracker());
    const state = manager.updateAfterTurn('fillSilence', 0.3);
    expect(state.silenceRisk).toBeGreaterThan(0);
  });
});

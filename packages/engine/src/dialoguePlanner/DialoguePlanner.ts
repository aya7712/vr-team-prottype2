import type { DialogueAct, DialogueActScore, SpeechExpectation } from '../types/dialogueAct.js';
import type { DialogueActCatalog } from './DialogueActCatalog.js';
import type { ScoreCalculator } from './ScoreCalculator.js';
import type { SoftmaxSelector } from './SoftmaxSelector.js';
import type { SpeechExpectationCalculator } from './SpeechExpectationCalculator.js';
import type { PlanningContext } from './types.js';

/** DialogueActCatalog/ScoreCalculator/SoftmaxSelector/SpeechExpectationCalculatorを束ねるファサード（F5）。 */
export class DialoguePlanner {
  constructor(
    private readonly catalog: DialogueActCatalog,
    private readonly scoreCalculator: ScoreCalculator,
    private readonly selector: SoftmaxSelector,
    private readonly expectationCalculator: SpeechExpectationCalculator,
  ) {}

  planNext(context: PlanningContext): {
    act: DialogueAct;
    scores: DialogueActScore[];
    expectation: SpeechExpectation;
  } {
    const rawScores = this.scoreCalculator.calculate(context);
    const { act, scores } = this.selector.select(rawScores);
    const expectation = this.expectationCalculator.calculate(context.previousAct);

    return { act, scores, expectation };
  }
}

import type { DialogueAct, DialogueActScore, SpeechExpectation } from '../types/dialogueAct.js';
import type { DialogueActCatalog } from './DialogueActCatalog.js';
import type { ScoreCalculator } from './ScoreCalculator.js';
import type { SoftmaxSelector } from './SoftmaxSelector.js';
import type { SpeechExpectationCalculator } from './SpeechExpectationCalculator.js';
import type { PlanningContext } from './types.js';

// Issue #16 (plan-b): 自身の思い出を長く語る（story）・話題を深掘りする（deepDive）といった
// 「自分語り系」のActは、同じ発話ペアへの発話集中が内容的に正当化されるシグナルの1つとして
// ConversationManagerが参照する。どのActを「自分語り系」とみなすかはfeatures.mdに明記が無いため
// 実装者判断で設定した（doc/changelog/20260905-003720-content-justified-speaker-balance.md）。story/deepDiveをこの区分にしたのは、
// ConversationManager.ACT_TO_TOPIC_EVENTが既にこの2つを「newInfo（新情報の投入）」として
// 扱っており、話題を掘り下げる発話として扱う既存の判断と一貫させるため。
const SELF_NARRATIVE_ACTS: ReadonlySet<DialogueAct> = new Set(['story', 'deepDive']);

/** 指定したDialogueActが「自分語り系」（story/deepDive）かどうかを判定する（Issue #16 plan-b）。 */
export function isSelfNarrativeAct(act: DialogueAct): boolean {
  return SELF_NARRATIVE_ACTS.has(act);
}

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

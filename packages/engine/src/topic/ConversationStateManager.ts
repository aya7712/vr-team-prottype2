import type { ConversationState } from '../types/topic.js';
import type { DialogueAct } from '../types/dialogueAct.js';
import type { RhythmTracker } from './RhythmTracker.js';

const RHYTHM_HISTORY_WINDOW = 5;

// F4.5: atmosphere/silenceRisk/excitementの更新則はfeatures.mdに数値仕様が
// 無いため実装者判断で設定した。ポジティブなActは雰囲気・盛り上がりを上げ
// 沈黙リスクを下げ、fillSilence/topicShiftは逆方向に作用する。
const POSITIVE_ACTS = new Set<DialogueAct>(['empathy', 'joke', 'tsukkomi', 'story', 'deepDive']);
const NEGATIVE_ACTS = new Set<DialogueAct>(['deny', 'fillSilence']);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function initialState(): ConversationState {
  return {
    currentTopicId: '',
    atmosphere: 0.5,
    silenceRisk: 0,
    excitement: 0.5,
    elapsedTurns: 0,
    unresolvedQuestions: [],
    rhythm: [],
  };
}

/** ConversationState全体の保持・更新を担う（F4.5）。 */
export class ConversationStateManager {
  private state: ConversationState;

  constructor(private readonly rhythmTracker: RhythmTracker) {
    this.state = initialState();
  }

  getState(): ConversationState {
    return this.state;
  }

  updateAfterTurn(act: DialogueAct, topicScore: number): ConversationState {
    this.rhythmTracker.recordAct(act);

    const moodDelta = POSITIVE_ACTS.has(act) ? 0.1 : NEGATIVE_ACTS.has(act) ? -0.1 : 0;

    const unresolvedQuestions =
      act === 'question'
        ? [...this.state.unresolvedQuestions, `turn:${this.state.elapsedTurns + 1}`]
        : act === 'answer' && this.state.unresolvedQuestions.length > 0
          ? this.state.unresolvedQuestions.slice(1)
          : this.state.unresolvedQuestions;

    this.state = {
      ...this.state,
      atmosphere: clamp(this.state.atmosphere + moodDelta, 0, 1),
      excitement: clamp(this.state.excitement * 0.7 + topicScore * 0.3, 0, 1),
      silenceRisk: clamp(
        act === 'fillSilence' ? this.state.silenceRisk + 0.2 : this.state.silenceRisk - 0.1,
        0,
        1,
      ),
      elapsedTurns: this.state.elapsedTurns + 1,
      unresolvedQuestions,
      rhythm: [...this.state.rhythm, act].slice(-RHYTHM_HISTORY_WINDOW),
    };
    return this.state;
  }
}

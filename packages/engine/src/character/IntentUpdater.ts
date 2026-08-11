import type { CharacterState } from '../types/character.js';
import type { DialogueAct } from '../types/dialogueAct.js';
import type { TurnUpdateContext } from './types.js';

// 相手から向けられたDialogueActに対する直近の意図（features.md F1.2）。
const INTENT_RULES: Record<DialogueAct, string> = {
  empathy: '感謝を伝える',
  deny: '弁明する',
  joke: 'ボケ返す',
  tsukkomi: '乗っかる',
  question: '答える',
  answer: '深掘りする',
  story: '相槌を打つ',
  deepDive: '深掘りする',
  topicShift: '話に乗る',
  fillSilence: '話題を振る',
};

/**
 * 更新後のgoalとreceivedActを踏まえてconversationIntentを更新する（F1.2の3番目のステップ）。
 * `state`は呼び出し時点でemotion/currentGoalが更新済みであることを前提とする。
 */
export class IntentUpdater {
  // 現状はreceivedActのみからintentを決定する。CharacterStateはupdate系クラス間で
  // シグネチャを揃えるために受け取るが、このクラスでは未使用。
  update(_state: CharacterState, context: TurnUpdateContext): string {
    return INTENT_RULES[context.receivedAct];
  }
}

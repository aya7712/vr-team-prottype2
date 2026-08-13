import type { DialogueAct } from '../types/dialogueAct.js';
import type { TopicTree } from '../topic/TopicTree.js';
import type { ConversationStateManager } from '../topic/ConversationStateManager.js';

export interface RecentUtterance {
  speakerId: string;
  utterance: string;
  turnNo: number;
}

/**
 * ConversationManager.runTurn/runSessionが受け取り、ターンをまたいで
 * ミュータブルに更新するセッション状態。class-design.md 9章では
 * `SessionState`型は未定義だったため、実装者判断でconversationManagerドメイン内の
 * ローカル型として定義した（T12）。短期記憶（recentUtterances）はdata-design.md 6.4の
 * 「Topic Analyzer/Dialogue Plannerがオンメモリの会話履歴配列を直接参照する」に対応する。
 */
export interface SessionState {
  sessionId: string;
  participantIds: string[];
  topicTree: TopicTree;
  conversationStateManager: ConversationStateManager;
  turnNo: number;
  previousAct?: DialogueAct;
  previousSpeakerId?: string;
  // T29: SpeakerSelectorの「名指し/呼びかけ」判定に使う。直前ターンの発話が
  // 誰に向けられていたか（TurnResult.targetIds）をそのまま引き継ぐ。
  previousTargetIds?: string[];
  recentUtterances: RecentUtterance[];
}

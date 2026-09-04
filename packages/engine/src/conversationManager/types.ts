import type { DialogueAct } from '../types/dialogueAct.js';
import type { TopicTree } from '../topic/TopicTree.js';
import type { ConversationStateManager } from '../topic/ConversationStateManager.js';

export interface RecentUtterance {
  speakerId: string;
  utterance: string;
  turnNo: number;
  // Issue #15対応（plan-c、AddresseeSelector）: このターンの発話が誰に向けられていたかを
  // 保持する。TurnResult.targetIdsをそのまま引き継ぐ（全員向け発話の場合は話者以外の
  // 参加者全員のIDが入る）。AddresseeSelectorの発話頻度バランス算出（直近呼びかけ回数）に使う。
  targetIds: string[];
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
  // T35: 会話開始時に必須指定する最初のトピック。resolveTopicが最初の発話の
  // 分類対象として使い、「(会話開始)」プレースホルダーの代わりにこの文字列から
  // TopicTreeを開始する。
  initialTopic: string;
}

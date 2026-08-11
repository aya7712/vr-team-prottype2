import type { ConversationState } from '../types/topic.js';

/**
 * シナリオ設定（動画尺・制約）とConversationStateから会話の終了タイミングを判定する（F6.5）。
 * T12時点ではmaxTurns到達のみを判定する最小実装（シナリオ設定自体はF6.6でT12未実装のため）。
 */
export class EndConditionEvaluator {
  shouldEnd(conversationState: ConversationState, maxTurns: number): boolean {
    return conversationState.elapsedTurns >= maxTurns;
  }
}

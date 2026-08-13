import type { DialogueAct } from './dialogueAct.js';

export interface Topic {
  id: string;
  parentTopicId?: string;
  label: string;
  depth: number;
  energy: number;
  novelty: number;
  life: number;
  emotionality?: number;
  unresolved: boolean;
  lastMentionTurn?: number;
  // F6.3（T30）: このTopicが特定のサブグループに分岐したものである場合、
  // そのサブグループの参加者IDを保持する。undefinedはセッション全体参加者を指す
  // （2体会話や分岐前のTopicとの後方互換のため、既定では未設定）。
  participantIds?: string[];
}

export interface ConversationState {
  currentTopicId: string;
  atmosphere: number;
  silenceRisk: number;
  excitement: number;
  elapsedTurns: number;
  unresolvedQuestions: string[];
  rhythm: DialogueAct[];
}

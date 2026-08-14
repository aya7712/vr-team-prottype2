import type { DialogueAct, TargetCharacterIds } from '@prottype2/engine';

export type SessionStatus = 'running' | 'stopped' | 'completed';

// `sessions`テーブルに対応するレコード。scenarioはF6.6（シナリオ入力）が未実装のため
// 現時点では任意のJSON値として扱う（architecture.md 7章 POST /api/sessions）。
export interface SessionRecord {
  id: string;
  scenario: unknown;
  participantIds: string[];
  createdAt: string;
  status: SessionStatus;
  // T35: 会話開始時の最初のトピック（必須）。ConversationManagerが
  // TopicTreeをこのトピックから開始するために使う。
  initialTopic: string;
}

export interface CreateSessionInput {
  id: string;
  scenario: unknown;
  participantIds: string[];
  status: SessionStatus;
  initialTopic: string;
}

// `turns`テーブルに対応するレコード。フィールド構成はengineのTurnResult（types/turn.ts）と
// 一致させている（`TurnOrchestrator`がConversationManagerの出力をそのまま渡せるように）。
export interface TurnRecord {
  sessionId: string;
  turnNo: number;
  speakerId: string;
  targetIds?: TargetCharacterIds;
  topicId: string;
  dialogueAct: DialogueAct;
  utterance: string;
  createdAt: string;
}

export type LayerName =
  'topic' | 'relationship' | 'character' | 'dialoguePlanner' | 'memory' | 'llm';

// `turn_layer_events`テーブルに対応するレコード（F8.1/F9.3）。
export interface LayerEventRecord {
  sessionId: string;
  turnNo: number;
  layer: LayerName;
  payload: unknown;
  createdAt: string;
}

export type FeedbackRating = 'natural' | 'unnatural';

// `turn_feedback`テーブルに対応するレコード（F8.2/F9.5）。
export interface FeedbackRecord {
  sessionId: string;
  turnNo: number;
  rating: FeedbackRating;
  comment: string | null;
  createdAt: string;
}

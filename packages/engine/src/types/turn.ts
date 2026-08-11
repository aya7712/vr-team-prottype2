import type { DialogueAct } from './dialogueAct.js';

export type TargetCharacterIds = string[];

// SessionStateはclass-design.md 9章で未定義のため、T12（ConversationManager実装）着手時に
// 実際の使われ方に合わせてフィールドを見直すこと。
export interface TurnInput {
  sessionId: string;
  turnNo: number;
  participantIds: string[];
}

export interface TurnResult {
  sessionId: string;
  turnNo: number;
  speakerId: string;
  targetIds?: TargetCharacterIds;
  topicId: string;
  dialogueAct: DialogueAct;
  utterance: string;
  createdAt: string;
}

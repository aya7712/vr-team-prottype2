import type { DialogueAct } from '../types/dialogueAct.js';

export interface MemoryFilter {
  participants?: string[];
  // Issue #9: 他人視点の記憶（owner違い）が発話材料に混ざるのを防ぐため、
  // ownerIdは省略不可の必須条件とする（呼び出し側が指定を忘れる余地をなくす）。
  ownerId: string;
  shareableOnly?: boolean;
}

export interface MemoryQuery {
  sessionId: string;
  turnNo: number;
  speakerId: string;
  targetIds: string[];
  topicKeywords: string[];
  dialogueAct: DialogueAct;
}

import type { DialogueAct } from '../types/dialogueAct.js';

export interface MemoryFilter {
  participants?: string[];
  ownerId?: string;
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

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

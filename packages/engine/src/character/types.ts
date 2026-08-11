import type { DialogueAct } from '../types/dialogueAct.js';

// F1.2 状態更新パイプライン（features.md）の入力。
// 直前のターンで相手からこのキャラクターに向けられたDialogueActを表す。
export interface TurnUpdateContext {
  receivedAct: DialogueAct;
  fromCharacterId: string;
}

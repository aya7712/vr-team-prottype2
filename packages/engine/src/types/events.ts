import type { CharacterState } from './character.js';
import type { RelationshipEdge } from './relationship.js';
import type { MemoryItem } from './memory.js';
import type { ConversationState, Topic } from './topic.js';
import type { DialogueAct, DialogueActScore, SpeechExpectation } from './dialogueAct.js';
import type { TurnResult } from './turn.js';

// ペイロード形状はclass-design.md 11章では未確定（`unknown`として設計）のため、
// T13（EngineEventBus実装）着手時にここを正として運用するか見直すこと。
export type LayerEventName =
  | 'turn:start'
  | 'layer:speakerBalance'
  | 'layer:topic'
  | 'layer:relationship'
  | 'layer:character'
  | 'layer:dialoguePlanner'
  | 'layer:memory'
  | 'layer:llm'
  | 'turn:complete'
  | 'session:end';

export interface TurnStartPayload {
  turnNo: number;
  speakerCandidateIds: string[];
}

// Issue #16対応（plan-c、T44）: SpeakerBalanceAdvisor（F7、追加のLLM呼び出しによる
// 発話バランスの意味的判定）の結果をログ・レポートで目視確認できるよう新設したレイヤー
// イベント。ConversationManager.runTurnはturn:start発行直後にこれをemitする
// （speakerSelector.selectNextの直前で計算した結果をここで初めて発行する。turn:startより
// 前にemitすると、TurnOrchestrator.subscribePersistence（server層）がturn:start受信時に
// pendingLayerEventsをリセットする実装のため、直後のリセットで消えてしまう）。
export interface SpeakerBalanceLayerPayload {
  prompt: string;
  // 判定材料が無い（会話開始直後）/呼び出し失敗時はnull。
  rawOutput: string | null;
  justified: boolean;
  recommendedSpeakerId: string | null;
  reason: string;
  error?: string;
}

export interface TopicLayerPayload {
  topic: Topic;
  conversationState: ConversationState;
}

export interface RelationshipLayerPayload {
  speakerId: string;
  targetId: string;
  edge: RelationshipEdge;
}

export interface CharacterLayerPayload {
  characterState: CharacterState;
}

export interface DialoguePlannerLayerPayload {
  scores: DialogueActScore[];
  selectedAct: DialogueAct;
  expectation: SpeechExpectation;
}

export interface MemoryLayerPayload {
  retrieved: MemoryItem[];
}

export interface LlmLayerPayload {
  prompt: string;
  rawOutput: string;
}

export type TurnCompletePayload = TurnResult;

// T41: セッション全体（`runSession`のfor-await-ofループ）の終了理由。`stopped`はrequestStop()
// による意図的な打ち切り、`failed`はLLM/Embedding呼び出しの例外等による予期しない中断（T40）。
export type SessionEndReason = 'completed' | 'stopped' | 'failed';

export interface SessionEndPayload {
  reason: SessionEndReason;
  // reason: 'failed'の場合のみ、原因を特定するためのエラーメッセージを含める。
  error?: string;
}

export type LayerEvent =
  | { name: 'turn:start'; payload: TurnStartPayload }
  | { name: 'layer:speakerBalance'; payload: SpeakerBalanceLayerPayload }
  | { name: 'layer:topic'; payload: TopicLayerPayload }
  | { name: 'layer:relationship'; payload: RelationshipLayerPayload }
  | { name: 'layer:character'; payload: CharacterLayerPayload }
  | { name: 'layer:dialoguePlanner'; payload: DialoguePlannerLayerPayload }
  | { name: 'layer:memory'; payload: MemoryLayerPayload }
  | { name: 'layer:llm'; payload: LlmLayerPayload }
  | { name: 'turn:complete'; payload: TurnCompletePayload }
  | { name: 'session:end'; payload: SessionEndPayload };

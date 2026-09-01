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

// Issue #5対応（plan-e、T43）: ToneReviewer（F7、追加のLLM呼び出しによる口調審査・書き換え）
// の結果をログ・レポートで目視確認できるよう、既存のlayer:llmイベントにoptionalで追加した
// （新規イベント名は増やさず、1ターン1回のlayer:llm発行という既存の順序を変えないため）。
export interface LlmToneReview {
  prompt: string;
  // 審査呼び出し自体が失敗した場合はnull（ToneReviewer.review()参照）。
  rawOutput: string | null;
  applied: boolean;
  error?: string;
}

export interface LlmLayerPayload {
  prompt: string;
  rawOutput: string;
  toneReview?: LlmToneReview;
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
  | { name: 'layer:topic'; payload: TopicLayerPayload }
  | { name: 'layer:relationship'; payload: RelationshipLayerPayload }
  | { name: 'layer:character'; payload: CharacterLayerPayload }
  | { name: 'layer:dialoguePlanner'; payload: DialoguePlannerLayerPayload }
  | { name: 'layer:memory'; payload: MemoryLayerPayload }
  | { name: 'layer:llm'; payload: LlmLayerPayload }
  | { name: 'turn:complete'; payload: TurnCompletePayload }
  | { name: 'session:end'; payload: SessionEndPayload };

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

// Issue #5 plan-h: 発話生成を「内容決定」→「口調整形」の2段階に分離した。
// `prompt`/`rawOutput`は既存の消費側（UI/レポート）との後方互換のため、
// 最終的に採用されるセリフを生成した口調整形（stage2）側の値を指す。
// `contentStage`に内容決定（stage1）側のプロンプト・出力・抽出結果を別途持たせる。
export interface LlmLayerPayload {
  prompt: string;
  rawOutput: string;
  contentStage: {
    prompt: string;
    rawOutput: string;
    intent: string;
  };
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

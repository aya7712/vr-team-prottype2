import type { DialogueAct, TargetCharacterIds } from '@prottype2/engine';

export type SessionStatus = 'running' | 'stopped' | 'completed';

export interface Session {
  id: string;
  participantIds: string[];
  createdAt: string;
  status: SessionStatus;
  initialTopic: string;
}

export interface Turn {
  sessionId: string;
  turnNo: number;
  speakerId: string;
  targetIds?: TargetCharacterIds;
  topicId: string;
  dialogueAct: DialogueAct;
  utterance: string;
  createdAt: string;
}

export interface LayerEventRecord {
  sessionId: string;
  turnNo: number;
  layer: 'topic' | 'relationship' | 'character' | 'dialoguePlanner' | 'memory' | 'llm';
  payload: unknown;
  createdAt: string;
}

export type TurnDetail = Turn & { layerEvents: LayerEventRecord[] };

export type FeedbackRating = 'natural' | 'unnatural';

export interface Feedback {
  sessionId: string;
  turnNo: number;
  rating: FeedbackRating;
  comment: string | null;
  createdAt: string;
}

export interface CreateSessionRequest {
  participantIds: string[];
  initialTopic: string;
}

// `ui-design-rules.md` 2.2: キャラクターカラーはこの一覧が唯一の情報源。
export interface CharacterSummary {
  id: string;
  name: string;
  furigana: string | null;
  color: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message =
      body && typeof body === 'object' && 'error' in body
        ? String(body.error)
        : response.statusText;
    throw new ApiError(response.status, message);
  }
  return (await response.json()) as T;
}

/** `architecture.md` 7章のREST APIを呼び出す薄いクライアント（`class-design.md` 14章）。 */
export const apiClient = {
  listCharacters(): Promise<CharacterSummary[]> {
    return request<CharacterSummary[]>('/api/characters');
  },

  createSession(input: CreateSessionRequest): Promise<Session> {
    return request<Session>('/api/sessions', { method: 'POST', body: JSON.stringify(input) });
  },

  listSessions(): Promise<Session[]> {
    return request<Session[]>('/api/sessions');
  },

  getSession(sessionId: string): Promise<Session> {
    return request<Session>(`/api/sessions/${sessionId}`);
  },

  listTurns(sessionId: string): Promise<Turn[]> {
    return request<Turn[]>(`/api/sessions/${sessionId}/turns`);
  },

  getTurn(sessionId: string, turnNo: number): Promise<TurnDetail> {
    return request<TurnDetail>(`/api/sessions/${sessionId}/turns/${turnNo}`);
  },

  submitFeedback(
    sessionId: string,
    turnNo: number,
    rating: FeedbackRating,
    comment?: string | null,
  ): Promise<Feedback> {
    return request<Feedback>(`/api/sessions/${sessionId}/turns/${turnNo}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ rating, comment: comment ?? null }),
    });
  },

  runSession(sessionId: string, maxTurns?: number): Promise<Session> {
    return request<Session>(`/api/sessions/${sessionId}/run`, {
      method: 'POST',
      body: JSON.stringify(maxTurns === undefined ? {} : { maxTurns }),
    });
  },

  stopSession(sessionId: string): Promise<Session> {
    return request<Session>(`/api/sessions/${sessionId}/stop`, { method: 'POST' });
  },
};

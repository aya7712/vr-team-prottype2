import type { SessionRecord } from '../db/repositories/types.js';
import type { SessionRepository } from '../db/repositories/SessionRepository.js';
import type { CharacterCacheRepository } from '../db/repositories/CharacterCacheRepository.js';

const MIN_PARTICIPANTS = 2;
const MAX_PARTICIPANTS = 4;

export interface CreateSessionRequest {
  participantIds: string[];
  scenario?: unknown;
}

export class SessionValidationError extends Error {}

/**
 * セッション作成・キャラクター初期化を担う（class-design.md 13章）。
 * T17時点では「参加キャラクターがcharacters_cacheに実在するか」の検証と
 * セッションレコード作成のみを行う。実際の会話生成（ConversationManagerの
 * 組み立て・実行）はTurnOrchestrator（T18）が担う。
 */
export class SessionService {
  constructor(
    private readonly sessionRepository: SessionRepository,
    private readonly characterCacheRepository: CharacterCacheRepository,
  ) {}

  createSession(request: CreateSessionRequest): SessionRecord {
    const { participantIds, scenario } = request;

    if (
      !Array.isArray(participantIds) ||
      participantIds.length < MIN_PARTICIPANTS ||
      participantIds.length > MAX_PARTICIPANTS
    ) {
      throw new SessionValidationError(
        `participantIdsは${MIN_PARTICIPANTS}〜${MAX_PARTICIPANTS}体で指定してください`,
      );
    }
    if (new Set(participantIds).size !== participantIds.length) {
      throw new SessionValidationError('participantIdsに重複があります');
    }

    for (const id of participantIds) {
      if (!this.characterCacheRepository.exists(id)) {
        throw new SessionValidationError(`キャラクター "${id}" はcharacters_cacheに存在しません`);
      }
    }

    return this.sessionRepository.create({
      id: crypto.randomUUID(),
      scenario: scenario ?? null,
      participantIds,
      status: 'stopped',
    });
  }

  getSession(id: string): SessionRecord | null {
    return this.sessionRepository.findById(id);
  }

  // T17時点ではステータス遷移のみ。実際の会話生成ループはTurnOrchestrator（T18）が
  // ConversationManager.runSessionを呼び出して行う。
  run(id: string): SessionRecord | null {
    this.sessionRepository.updateStatus(id, 'running');
    return this.sessionRepository.findById(id);
  }

  stop(id: string): SessionRecord | null {
    this.sessionRepository.updateStatus(id, 'stopped');
    return this.sessionRepository.findById(id);
  }
}

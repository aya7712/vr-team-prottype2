import type { MemoryItem, MemorySource } from '../types/memory.js';
import type { MemoryRepository } from './MemoryRepository.js';
import type { MemoryFilter } from './types.js';

interface RecallRecord {
  sessionId: string;
  turnNo: number;
  memoryId: string;
  source: MemorySource;
}

function matchesFilter(item: MemoryItem, filter: MemoryFilter): boolean {
  if (filter.ownerId && item.owner !== filter.ownerId) return false;
  if (filter.shareableOnly && !item.shareable) return false;
  if (filter.participants && !filter.participants.some((id) => item.participants.includes(id))) {
    return false;
  }
  return true;
}

/**
 * SQLiteなしで動作確認するためのインメモリ実装（テスト用フェイク、T07）。
 * `getEmbedding`はデフォルトではnullを返すが、`saveEmbedding`で保存した分は
 * オンメモリのMapから復元できる（T43でsaveSessionMemory/saveEmbeddingを追加した際に
 * あわせて実装。それまでは意味検索の本実装はT15でSQLite版のみに追加していた）。
 */
export class InMemoryMemoryRepository implements MemoryRepository {
  private readonly recalls: RecallRecord[] = [];
  private readonly embeddings = new Map<string, Float32Array>();
  // T43自己レビューで発見: getAllCandidates（`items`全体を返す）をgetSelfVoiceCandidatesが
  // 流用すると、話者自身の過去発話が別セッションのものまで混入してしまう。sessionIdごとに
  // 分離して保持することで、MemoryRepositoryImpl（SQLite版, WHERE session_id = ?）と
  // 同じ「このセッション限定」の挙動を再現する。
  private readonly sessionMemoriesBySessionId = new Map<string, MemoryItem[]>();

  constructor(private readonly items: MemoryItem[] = []) {}

  async searchByKeyword(query: string, limit: number): Promise<MemoryItem[]> {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return [];

    const matches = this.items.filter((item) => {
      const haystack = [item.summary, item.tags.join(' '), item.body ?? ''].join(' ').toLowerCase();
      return haystack.includes(keyword);
    });
    return matches.slice(0, limit);
  }

  async getEmbedding(memoryId: string): Promise<Float32Array | null> {
    return this.embeddings.get(memoryId) ?? null;
  }

  async getAllCandidates(filter: MemoryFilter): Promise<MemoryItem[]> {
    return this.items.filter((item) => matchesFilter(item, filter));
  }

  async recordRecall(
    sessionId: string,
    turnNo: number,
    memoryId: string,
    source: MemorySource,
  ): Promise<void> {
    this.recalls.push({ sessionId, turnNo, memoryId, source });
  }

  async getRecentRecalls(sessionId: string, withinTurns: number): Promise<string[]> {
    const sessionRecalls = this.recalls.filter((r) => r.sessionId === sessionId);
    if (sessionRecalls.length === 0) return [];

    const latestTurnNo = Math.max(...sessionRecalls.map((r) => r.turnNo));
    const threshold = latestTurnNo - withinTurns;
    const recentIds = sessionRecalls.filter((r) => r.turnNo > threshold).map((r) => r.memoryId);
    return [...new Set(recentIds)];
  }

  // originTurnNoはMemoryRepositoryImpl（SQLite版）ではsession_memories.origin_turn_no列に
  // なるが、インメモリ版はrecordRecallと同様turnNoの厳密な永続化までは行わない（未使用）。
  async saveSessionMemory(
    sessionId: string,
    _originTurnNo: number,
    item: MemoryItem,
  ): Promise<void> {
    this.items.push(item);
    const sessionMemories = this.sessionMemoriesBySessionId.get(sessionId) ?? [];
    sessionMemories.push(item);
    this.sessionMemoriesBySessionId.set(sessionId, sessionMemories);
  }

  async saveEmbedding(
    memoryId: string,
    _source: MemorySource,
    _model: string,
    vector: Float32Array,
  ): Promise<void> {
    this.embeddings.set(memoryId, vector);
  }

  async getSelfVoiceCandidates(sessionId: string, speakerId: string): Promise<MemoryItem[]> {
    const sessionMemories = this.sessionMemoriesBySessionId.get(sessionId) ?? [];
    return sessionMemories.filter((item) => item.owner === speakerId);
  }
}

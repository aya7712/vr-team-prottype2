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
  if (item.owner !== filter.ownerId) return false;
  if (filter.shareableOnly && !item.shareable) return false;
  if (filter.participants && !filter.participants.some((id) => item.participants.includes(id))) {
    return false;
  }
  return true;
}

/**
 * SQLiteなしで動作確認するためのインメモリ実装（テスト用フェイク、T07）。
 * `getEmbedding`は常にnullを返す（意味検索の本実装はT15でSQLite版に追加）。
 */
export class InMemoryMemoryRepository implements MemoryRepository {
  private readonly recalls: RecallRecord[] = [];

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

  async getEmbedding(_memoryId: string): Promise<Float32Array | null> {
    return null;
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
}

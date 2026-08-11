import type { MemoryItem, MemorySource } from '../types/memory.js';
import type { MemoryFilter } from './types.js';

/**
 * server層（SQLite等）で実装され、engineへ注入されるインターフェース（依存性逆転、class-design.md 6章）。
 * engineはこのインターフェース越しにのみ記憶ストアへアクセスし、SQLiteを直接知らない。
 */
export interface MemoryRepository {
  searchByKeyword(query: string, limit: number): Promise<MemoryItem[]>;
  getEmbedding(memoryId: string): Promise<Float32Array | null>;
  getAllCandidates(filter: MemoryFilter): Promise<MemoryItem[]>;
  recordRecall(
    sessionId: string,
    turnNo: number,
    memoryId: string,
    source: MemorySource,
  ): Promise<void>;
  getRecentRecalls(sessionId: string, withinTurns: number): Promise<string[]>;
}

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
  // Issue #5（plan-f, T43）: 会話中に生成された発話をD8 session_memories（data-design.md 5.2）
  // として永続化するための書き込みメソッド。item.idにはowner/participantsを含む
  // MemoryItemをそのまま渡し、sessionId/originTurnNoは呼び出し元（MemoryRetriever）が
  // 別引数で渡す（recordRecallと同じ形式に揃えた。MemoryItem自体はpreset由来の記憶とも
  // 共用する型のためsessionスコープの情報を持たせていない）。
  saveSessionMemory(sessionId: string, originTurnNo: number, item: MemoryItem): Promise<void>;
  // CacheSyncService（server層、T15）がpresetMemory向けに個別実装していたwrite専用メソッドを
  // インターフェースへ昇格した（T43でsession由来の記憶にも同じ保存経路が必要になったため）。
  saveEmbedding(
    memoryId: string,
    source: MemorySource,
    model: string,
    vector: Float32Array,
  ): Promise<void>;
  // T43自己レビューで発見: `getAllCandidates`はsession_memories全体（他セッション分も含む）を
  // 返すため、これを流用すると話者自身の過去発話が別セッションのものまで混入してしまう
  // （`session_memories`は`sessions`テーブルに紐づくがMemoryFilterにsessionIdの概念が無いため）。
  // `retrieveSelfVoiceExemplars`は「このセッション中の自分の発話」だけを対象にする必要があるため、
  // sessionId/speakerIdで絞り込み済みの候補を返す専用メソッドとして分離した。
  getSelfVoiceCandidates(sessionId: string, speakerId: string): Promise<MemoryItem[]>;
}

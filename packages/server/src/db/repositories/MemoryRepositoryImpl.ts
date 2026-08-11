import type Database from 'better-sqlite3';
import type { MemoryFilter, MemoryItem, MemoryRepository, MemorySource } from '@prottype2/engine';

interface MemoryRow {
  id: string;
  source: MemorySource;
  owner: string;
  participants_json: string;
  occurred_at: string | null;
  occurred_era: string | null;
  location: string | null;
  summary: string;
  tags_json: string;
  importance: number;
  emotion: string | null;
  shareable: number;
  related_json: string | null;
  body: string | null;
}

function rowToMemoryItem(row: MemoryRow): MemoryItem {
  return {
    id: row.id,
    source: row.source,
    owner: row.owner,
    participants: JSON.parse(row.participants_json) as string[],
    occurredAt: row.occurred_at,
    occurredEra: row.occurred_era,
    location: row.location,
    summary: row.summary,
    tags: JSON.parse(row.tags_json) as string[],
    importance: row.importance,
    emotion: row.emotion,
    shareable: row.shareable === 1,
    related: row.related_json ? (JSON.parse(row.related_json) as string[]) : null,
    body: row.body ?? undefined,
  };
}

/**
 * `packages/engine/src/memory/MemoryRepository`インターフェースのSQLite実装（T15）。
 * `memory_preset_cache`（D3, character_def由来）と`session_memories`（D8, 会話中に生成）の
 * 両方を横断的に検索対象とする（data-design.md 5.3末尾）。
 */
export class MemoryRepositoryImpl implements MemoryRepository {
  constructor(private readonly db: Database.Database) {}

  async searchByKeyword(query: string, limit: number): Promise<MemoryItem[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    // FTS5デフォルトトークナイザ（unicode61）は日本語の部分文字列一致に対応しないため
    // （T14で判明、data-design.md 6.1）、フレーズ全体のクォート検索として扱う。
    const rows = this.db
      .prepare(
        `
        SELECT mpc.* FROM long_term_memory_fts fts
        JOIN memory_preset_cache mpc ON mpc.id = fts.memory_id AND fts.memory_source = 'preset'
        WHERE long_term_memory_fts MATCH ?
        LIMIT ?
      `,
      )
      .all(`"${trimmed.replaceAll('"', '""')}"`, limit) as MemoryRow[];

    return rows.map((row) => rowToMemoryItem({ ...row, source: 'preset' }));
  }

  async getEmbedding(memoryId: string): Promise<Float32Array | null> {
    const row = this.db
      .prepare('SELECT vector FROM memory_embeddings WHERE memory_id = ?')
      .get(memoryId) as { vector: Buffer } | undefined;
    if (!row) return null;

    // Float32Arrayはbyte offsetが4の倍数であることを要求するため、better-sqlite3が
    // 返すBufferのoffsetを信用せず、Buffer.from()で新規バッファへコピーしてから使う。
    const normalized = Buffer.from(row.vector);
    return new Float32Array(
      normalized.buffer,
      normalized.byteOffset,
      normalized.byteLength / Float32Array.BYTES_PER_ELEMENT,
    );
  }

  async getAllCandidates(filter: MemoryFilter): Promise<MemoryItem[]> {
    const presetRows = this.db.prepare('SELECT * FROM memory_preset_cache').all() as Omit<
      MemoryRow,
      'source'
    >[];
    const presetItems = presetRows.map((row) => rowToMemoryItem({ ...row, source: 'preset' }));

    const sessionRows = this.db
      .prepare(
        `
        SELECT id, owner, participants_json, NULL as occurred_at, NULL as occurred_era,
               NULL as location, summary, tags_json, importance, emotion, shareable,
               NULL as related_json, NULL as body
        FROM session_memories
      `,
      )
      .all() as Omit<MemoryRow, 'source'>[];
    const sessionItems = sessionRows.map((row) =>
      rowToMemoryItem({ ...row, source: 'session', owner: row.owner ?? '' }),
    );

    const all = [...presetItems, ...sessionItems];
    return all.filter((item) => {
      if (filter.ownerId && item.owner !== filter.ownerId) return false;
      if (filter.shareableOnly && !item.shareable) return false;
      if (
        filter.participants &&
        !filter.participants.some((id) => item.participants.includes(id))
      ) {
        return false;
      }
      return true;
    });
  }

  async recordRecall(
    sessionId: string,
    turnNo: number,
    memoryId: string,
    source: MemorySource,
  ): Promise<void> {
    this.db
      .prepare(
        `
        INSERT INTO memory_recall_log (session_id, turn_no, memory_id, memory_source, created_at)
        VALUES (?, ?, ?, ?, ?)
      `,
      )
      .run(sessionId, turnNo, memoryId, source, new Date().toISOString());
  }

  // MemoryRepositoryインターフェースには含まれない書き込み専用メソッド（server側のみで使用）。
  // CacheSyncService（T15）がmemory_preset_cache同期時にembeddingを計算してここへ保存する。
  saveEmbedding(memoryId: string, source: MemorySource, model: string, vector: Float32Array): void {
    const buffer = Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
    this.db
      .prepare(
        `
        INSERT INTO memory_embeddings (memory_id, memory_source, model, vector, updated_at)
        VALUES (@memoryId, @source, @model, @vector, @updatedAt)
        ON CONFLICT(memory_id) DO UPDATE SET
          memory_source = excluded.memory_source,
          model = excluded.model,
          vector = excluded.vector,
          updated_at = excluded.updated_at
      `,
      )
      .run({
        memoryId,
        source,
        model,
        vector: buffer,
        updatedAt: new Date().toISOString(),
      });
  }

  async getRecentRecalls(sessionId: string, withinTurns: number): Promise<string[]> {
    const latestRow = this.db
      .prepare('SELECT MAX(turn_no) as maxTurnNo FROM memory_recall_log WHERE session_id = ?')
      .get(sessionId) as { maxTurnNo: number | null };
    if (latestRow.maxTurnNo === null) return [];

    const threshold = latestRow.maxTurnNo - withinTurns;
    const rows = this.db
      .prepare(
        'SELECT DISTINCT memory_id FROM memory_recall_log WHERE session_id = ? AND turn_no > ?',
      )
      .all(sessionId, threshold) as { memory_id: string }[];
    return rows.map((r) => r.memory_id);
  }
}

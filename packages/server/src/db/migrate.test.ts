import { describe, expect, it, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { migrate } from './migrate.js';

interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  pk: number;
}

function getColumns(db: Database.Database, table: string): ColumnInfo[] {
  return db.prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[];
}

function getTableNames(db: Database.Database): string[] {
  return (
    db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')").all() as {
      name: string;
    }[]
  ).map((r) => r.name);
}

describe('migrate', () => {
  let db: Database.Database;

  afterEach(() => {
    db?.close();
  });

  it('data-design.md 5章の全テーブルを作成する', () => {
    db = new Database(':memory:');
    migrate(db);

    const tables = getTableNames(db);
    const expectedTables = [
      'characters_cache',
      'character_relationships_cache',
      'sub_characters_cache',
      'memory_preset_cache',
      'sessions',
      'relationship_state',
      'topics',
      'turns',
      'turn_layer_events',
      'session_memories',
      'memory_recall_log',
      'turn_feedback',
      'memory_embeddings',
    ];
    for (const table of expectedTables) {
      expect(tables).toContain(table);
    }
  });

  it('FTS5仮想テーブルlong_term_memory_ftsが作成される', () => {
    db = new Database(':memory:');
    migrate(db);

    const result = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'long_term_memory_fts'",
      )
      .get();
    expect(result).toBeDefined();

    // FTS5仮想テーブルにも実際にレコードを挿入・検索できることを確認する。
    // 注意: デフォルトのunicode61トークナイザは日本語の部分文字列一致に対応しない
    // （例: 'ボルダリング'では'ボルダリングの話'にヒットしない）。フレーズ全体の
    // クォート検索は可能（T15でカスタムトークナイザ導入の要否を検討する）。
    db.prepare(
      'INSERT INTO long_term_memory_fts (memory_id, memory_source, owner, summary, tags, body) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('mem_1', 'preset', 'char_a', 'ボルダリングの話', 'スポーツ', '本文');
    const matches = db
      .prepare(
        `SELECT memory_id FROM long_term_memory_fts WHERE long_term_memory_fts MATCH '"ボルダリングの話"'`,
      )
      .all();
    expect(matches).toEqual([{ memory_id: 'mem_1' }]);
  });

  it('characters_cacheが期待通りのカラムを持つ', () => {
    db = new Database(':memory:');
    migrate(db);

    const columns = getColumns(db, 'characters_cache').map((c) => c.name);
    expect(columns).toEqual([
      'id',
      'name',
      'furigana',
      'age',
      'gender',
      'first_person',
      'personality',
      'tone_sample',
      'vocabulary_json',
      'ng_topics_json',
      'unit_context_json',
      'llm_json',
      'raw_yaml_path',
      'loaded_at',
    ]);

    const idColumn = getColumns(db, 'characters_cache').find((c) => c.name === 'id');
    expect(idColumn?.pk).toBe(1);
    const nameColumn = getColumns(db, 'characters_cache').find((c) => c.name === 'name');
    expect(nameColumn?.notnull).toBe(1);
  });

  it('turnsが複合主キー(session_id, turn_no)を持つ', () => {
    db = new Database(':memory:');
    migrate(db);

    const columns = getColumns(db, 'turns');
    const pkColumns = columns.filter((c) => c.pk > 0).map((c) => c.name);
    expect(pkColumns.sort()).toEqual(['session_id', 'turn_no']);
  });

  it('memory_embeddingsが期待通りのカラムを持つ', () => {
    db = new Database(':memory:');
    migrate(db);

    const columns = getColumns(db, 'memory_embeddings').map((c) => c.name);
    expect(columns).toEqual(['memory_id', 'memory_source', 'model', 'vector', 'updated_at']);
  });

  it('複数回実行しても例外を投げない（IF NOT EXISTSによる冪等性）', () => {
    db = new Database(':memory:');
    migrate(db);
    expect(() => migrate(db)).not.toThrow();
  });

  it('openMigratedDatabaseはファイルを開いてマイグレーションを適用する', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { openMigratedDatabase } = await import('./migrate.js');

    const dir = mkdtempSync(join(tmpdir(), 'db-test-'));
    const dbPath = join(dir, 'test.sqlite');

    const opened = openMigratedDatabase(dbPath);
    try {
      expect(getTableNames(opened)).toContain('sessions');
    } finally {
      opened.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

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
      'color',
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

  it('T35: sessionsテーブルにinitial_topicカラムが追加される', () => {
    db = new Database(':memory:');
    migrate(db);

    const columns = getColumns(db, 'sessions').map((c) => c.name);
    expect(columns).toContain('initial_topic');
  });

  it('T35: initial_topic追加前の旧スキーマDBに適用してもデータが失われず、カラムが追加される', () => {
    db = new Database(':memory:');
    // schema.sqlのCREATE TABLE定義だけを直接実行し、ALTER TABLEマイグレーション未適用の
    // 「旧スキーマ」状態を再現する（migrate()を通さない）。
    db.exec(`
      CREATE TABLE sessions (
        id                TEXT PRIMARY KEY,
        scenario_json     TEXT NOT NULL,
        participant_ids_json TEXT NOT NULL,
        created_at        TEXT NOT NULL,
        status            TEXT NOT NULL
      );
    `);
    db.prepare(
      'INSERT INTO sessions (id, scenario_json, participant_ids_json, created_at, status) VALUES (?, ?, ?, ?, ?)',
    ).run('session_1', '{}', '["char_a"]', '2026-01-01T00:00:00.000Z', 'stopped');

    migrate(db);

    const columns = getColumns(db, 'sessions').map((c) => c.name);
    expect(columns).toContain('initial_topic');
    const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get('session_1') as {
      id: string;
      status: string;
      initial_topic: string;
    };
    expect(row.id).toBe('session_1');
    expect(row.status).toBe('stopped');
    // 旧データはNOT NULL制約を満たすプレースホルダー値で埋められる
    // （`SessionRecord.initialTopic`はnull不可の必須stringとして扱うため）。
    expect(row.initial_topic).toBe('(不明)');

    // 2回目の適用でも既に追加済みのカラムに対してALTER TABLEを再実行せず例外を投げない。
    expect(() => migrate(db)).not.toThrow();
  });

  it('T39: sessionsテーブルからscenario_jsonカラムが削除される（新規DBでも）', () => {
    db = new Database(':memory:');
    migrate(db);

    const columns = getColumns(db, 'sessions').map((c) => c.name);
    expect(columns).not.toContain('scenario_json');
  });

  it('T39: scenario_json削除前の旧スキーマDBに適用してもデータが失われず、カラムが削除される', () => {
    db = new Database(':memory:');
    // scenario_jsonがまだ残っていた（T39以前の）「旧スキーマ」状態を再現する（migrate()を通さない）。
    db.exec(`
      CREATE TABLE sessions (
        id                TEXT PRIMARY KEY,
        scenario_json     TEXT NOT NULL,
        participant_ids_json TEXT NOT NULL,
        created_at        TEXT NOT NULL,
        status            TEXT NOT NULL,
        initial_topic     TEXT NOT NULL DEFAULT '(不明)'
      );
    `);
    db.pragma('user_version = 1');
    db.prepare(
      'INSERT INTO sessions (id, scenario_json, participant_ids_json, created_at, status, initial_topic) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('session_1', '{}', '["char_a"]', '2026-01-01T00:00:00.000Z', 'stopped', 'テスト話題');

    migrate(db);

    const columns = getColumns(db, 'sessions').map((c) => c.name);
    expect(columns).not.toContain('scenario_json');
    const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get('session_1') as {
      id: string;
      status: string;
      initial_topic: string;
    };
    expect(row.id).toBe('session_1');
    expect(row.status).toBe('stopped');
    expect(row.initial_topic).toBe('テスト話題');

    // 2回目の適用でも既に削除済みのカラムに対してALTER TABLEを再実行せず例外を投げない。
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

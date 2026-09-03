import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SCHEMA_PATH = join(dirname(fileURLToPath(import.meta.url)), 'schema.sql');

/**
 * `schema_version`で管理するバージョン管理付きALTER TABLEマイグレーション（T35）。
 * `CREATE TABLE IF NOT EXISTS`だけでは既存テーブルへのカラム追加に対応できず、
 * 確認用データ（`data/engine.sqlite`）を保持したままスキーマを進化させられないため、
 * 既存DBに対して不足しているバージョンのステップだけを適用する仕組みを追加した
 * （2026-08-13ユーザー確認: 削除・作り直しではなくALTER TABLE方式を採用）。
 */
const MIGRATIONS: { version: number; apply: (db: Database.Database) => void }[] = [
  {
    version: 1,
    apply: (db) => {
      // 既存データ（マイグレーション前に作成されたセッション）にもNOT NULLを
      // 満たす値が入るよう、DEFAULTで旧データ向けのプレースホルダーを与える
      // （`SessionRecord.initialTopic`はUI側も含め必須の`string`として扱うため）。
      db.exec("ALTER TABLE sessions ADD COLUMN initial_topic TEXT NOT NULL DEFAULT '(不明)'");
    },
  },
  {
    version: 2,
    apply: (db) => {
      // `scenario`（F6.6シナリオ入力）はT35でinitialTopicにスコープダウンされて以降、
      // UI/API経由で設定されることのない未使用フィールドだったため削除する（doc/todo.md T39）。
      db.exec('ALTER TABLE sessions DROP COLUMN scenario_json');
    },
  },
  {
    version: 3,
    apply: (db) => {
      // Issue #5コメント案1対応: 話者本人の記憶（memory/<owner>/*.md）から抽出した
      // 口調実例（ToneExemplarSelector出力）をキャッシュする列を追加する。
      // NULL許容（NOT NULL制約なし）とし、旧データの再取り込み前でもNULL→空配列に
      // フォールバックできるようにする（CharacterCacheRepository.findByIds参照）。
      db.exec('ALTER TABLE characters_cache ADD COLUMN tone_exemplars_json TEXT');
    },
  },
];

function getSchemaVersion(db: Database.Database): number {
  const row = db.pragma('user_version', { simple: true }) as number;
  return row;
}

function setSchemaVersion(db: Database.Database, version: number): void {
  db.pragma(`user_version = ${version}`);
}

/**
 * `data-design.md` 5章のテーブル群を適用する。`CREATE TABLE IF NOT EXISTS`のため複数回実行しても安全。
 * schema.sqlは常にMIGRATIONSより先に実行する前提（schema.sql自体はuser_versionを変更しないため
 * 実行順は現状影響しないが、将来schema.sql側もバージョンに応じて変える場合はこの前提を崩さないこと）。
 */
export function migrate(db: Database.Database): void {
  const schema = readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);

  const currentVersion = getSchemaVersion(db);
  for (const migration of MIGRATIONS) {
    if (migration.version > currentVersion) {
      migration.apply(db);
      setSchemaVersion(db, migration.version);
    }
  }
}

/** DBファイルを開き（無ければ作成し）、マイグレーションを適用して返す（architecture.md 10章）。 */
export function openMigratedDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  migrate(db);
  return db;
}

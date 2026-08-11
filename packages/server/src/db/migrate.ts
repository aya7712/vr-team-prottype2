import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SCHEMA_PATH = join(dirname(fileURLToPath(import.meta.url)), 'schema.sql');

/** `data-design.md` 5章のテーブル群を適用する。`CREATE TABLE IF NOT EXISTS`のため複数回実行しても安全。 */
export function migrate(db: Database.Database): void {
  const schema = readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);
}

/** DBファイルを開き（無ければ作成し）、マイグレーションを適用して返す（architecture.md 10章）。 */
export function openMigratedDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  migrate(db);
  return db;
}

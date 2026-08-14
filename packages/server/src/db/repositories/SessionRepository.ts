import type Database from 'better-sqlite3';
import type { CreateSessionInput, SessionRecord, SessionStatus } from './types.js';

interface SessionRow {
  id: string;
  scenario_json: string;
  participant_ids_json: string;
  created_at: string;
  status: SessionStatus;
  initial_topic: string;
}

function rowToSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    scenario: JSON.parse(row.scenario_json),
    participantIds: JSON.parse(row.participant_ids_json) as string[],
    createdAt: row.created_at,
    status: row.status,
    initialTopic: row.initial_topic,
  };
}

/** `sessions`テーブルへのCRUD（class-design.md 13章、architecture.md 7章 POST/GET /api/sessions）。 */
export class SessionRepository {
  constructor(private readonly db: Database.Database) {}

  create(input: CreateSessionInput): SessionRecord {
    const createdAt = new Date().toISOString();
    this.db
      .prepare(
        `
        INSERT INTO sessions (id, scenario_json, participant_ids_json, created_at, status, initial_topic)
        VALUES (@id, @scenarioJson, @participantIdsJson, @createdAt, @status, @initialTopic)
      `,
      )
      .run({
        id: input.id,
        scenarioJson: JSON.stringify(input.scenario),
        participantIdsJson: JSON.stringify(input.participantIds),
        createdAt,
        status: input.status,
        initialTopic: input.initialTopic,
      });

    return {
      id: input.id,
      scenario: input.scenario,
      participantIds: input.participantIds,
      createdAt,
      status: input.status,
      initialTopic: input.initialTopic,
    };
  }

  findById(id: string): SessionRecord | null {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as
      SessionRow | undefined;
    return row ? rowToSession(row) : null;
  }

  updateStatus(id: string, status: SessionStatus): void {
    this.db.prepare('UPDATE sessions SET status = ? WHERE id = ?').run(status, id);
  }

  list(): SessionRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM sessions ORDER BY created_at')
      .all() as SessionRow[];
    return rows.map(rowToSession);
  }
}

import type Database from 'better-sqlite3';
import type { FeedbackRating, FeedbackRecord } from './types.js';

interface FeedbackRow {
  session_id: string;
  turn_no: number;
  rating: FeedbackRating;
  comment: string | null;
  created_at: string;
}

function rowToFeedback(row: FeedbackRow): FeedbackRecord {
  return {
    sessionId: row.session_id,
    turnNo: row.turn_no,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.created_at,
  };
}

/**
 * `turn_feedback`テーブルへのCRUD（class-design.md 13章、F8.2/F9.5）。
 * PRIMARY KEY (session_id, turn_no) のため、同一ターンへの再登録はupsert（上書き）する。
 */
export class FeedbackRepository {
  constructor(private readonly db: Database.Database) {}

  upsert(
    sessionId: string,
    turnNo: number,
    rating: FeedbackRating,
    comment: string | null,
  ): FeedbackRecord {
    const createdAt = new Date().toISOString();
    this.db
      .prepare(
        `
        INSERT INTO turn_feedback (session_id, turn_no, rating, comment, created_at)
        VALUES (@sessionId, @turnNo, @rating, @comment, @createdAt)
        ON CONFLICT(session_id, turn_no) DO UPDATE SET
          rating = excluded.rating,
          comment = excluded.comment,
          created_at = excluded.created_at
      `,
      )
      .run({ sessionId, turnNo, rating, comment, createdAt });

    return { sessionId, turnNo, rating, comment, createdAt };
  }

  findByTurn(sessionId: string, turnNo: number): FeedbackRecord | null {
    const row = this.db
      .prepare('SELECT * FROM turn_feedback WHERE session_id = ? AND turn_no = ?')
      .get(sessionId, turnNo) as FeedbackRow | undefined;
    return row ? rowToFeedback(row) : null;
  }

  listBySession(sessionId: string): FeedbackRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM turn_feedback WHERE session_id = ? ORDER BY turn_no')
      .all(sessionId) as FeedbackRow[];
    return rows.map(rowToFeedback);
  }
}

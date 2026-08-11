import type Database from 'better-sqlite3';
import type { LayerEventRecord, LayerName, TurnRecord } from './types.js';

interface TurnRow {
  session_id: string;
  turn_no: number;
  speaker_id: string;
  target_ids_json: string | null;
  topic_id: string;
  dialogue_act: TurnRecord['dialogueAct'];
  utterance: string;
  created_at: string;
}

interface LayerEventRow {
  session_id: string;
  turn_no: number;
  layer: LayerName;
  payload_json: string;
  created_at: string;
}

function rowToTurn(row: TurnRow): TurnRecord {
  return {
    sessionId: row.session_id,
    turnNo: row.turn_no,
    speakerId: row.speaker_id,
    targetIds: row.target_ids_json ? JSON.parse(row.target_ids_json) : undefined,
    topicId: row.topic_id,
    dialogueAct: row.dialogue_act,
    utterance: row.utterance,
    createdAt: row.created_at,
  };
}

function rowToLayerEvent(row: LayerEventRow): LayerEventRecord {
  return {
    sessionId: row.session_id,
    turnNo: row.turn_no,
    layer: row.layer,
    payload: JSON.parse(row.payload_json),
    createdAt: row.created_at,
  };
}

/**
 * `turns`/`turn_layer_events`テーブルへのCRUD（class-design.md 13章、F8.1）。
 * `TurnOrchestrator`（T18）がConversationManagerの`TurnResult`/レイヤーイベントを
 * そのまま渡して永続化する想定。
 */
export class TurnRepository {
  constructor(private readonly db: Database.Database) {}

  createTurn(turn: TurnRecord): TurnRecord {
    this.db
      .prepare(
        `
        INSERT INTO turns
          (session_id, turn_no, speaker_id, target_ids_json, topic_id, dialogue_act, utterance, created_at)
        VALUES (@sessionId, @turnNo, @speakerId, @targetIdsJson, @topicId, @dialogueAct, @utterance, @createdAt)
      `,
      )
      .run({
        sessionId: turn.sessionId,
        turnNo: turn.turnNo,
        speakerId: turn.speakerId,
        targetIdsJson: turn.targetIds ? JSON.stringify(turn.targetIds) : null,
        topicId: turn.topicId,
        dialogueAct: turn.dialogueAct,
        utterance: turn.utterance,
        createdAt: turn.createdAt,
      });
    return turn;
  }

  findByTurnNo(sessionId: string, turnNo: number): TurnRecord | null {
    const row = this.db
      .prepare('SELECT * FROM turns WHERE session_id = ? AND turn_no = ?')
      .get(sessionId, turnNo) as TurnRow | undefined;
    return row ? rowToTurn(row) : null;
  }

  listBySession(sessionId: string): TurnRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM turns WHERE session_id = ? ORDER BY turn_no')
      .all(sessionId) as TurnRow[];
    return rows.map(rowToTurn);
  }

  createLayerEvent(sessionId: string, turnNo: number, layer: LayerName, payload: unknown): void {
    this.db
      .prepare(
        `
        INSERT INTO turn_layer_events (session_id, turn_no, layer, payload_json, created_at)
        VALUES (?, ?, ?, ?, ?)
      `,
      )
      .run(sessionId, turnNo, layer, JSON.stringify(payload), new Date().toISOString());
  }

  listLayerEvents(sessionId: string, turnNo: number): LayerEventRecord[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM turn_layer_events WHERE session_id = ? AND turn_no = ? ORDER BY created_at',
      )
      .all(sessionId, turnNo) as LayerEventRow[];
    return rows.map(rowToLayerEvent);
  }
}

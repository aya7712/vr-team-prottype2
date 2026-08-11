import type Database from 'better-sqlite3';
import type { Topic } from '@prottype2/engine';

/**
 * `topics`テーブルへの書き込み（data-design.md 5.2）。
 * T16では対象外としていたが、T18で`TurnOrchestrator`が`turns.topic_id`のFK制約を
 * 満たすために必要となったため追加した（`turns`挿入前に対応する`topics`行が必要）。
 */
export class TopicRepository {
  constructor(private readonly db: Database.Database) {}

  // 同じTopicが複数ターンに渡って参照される（continuedやchildの追跡）ため、
  // 既存行があれば数値パラメータのみ更新する（作成ターンcreated_at_turnは保持する）。
  upsert(sessionId: string, topic: Topic, turnNo: number): void {
    this.db
      .prepare(
        `
        INSERT INTO topics
          (id, session_id, parent_topic_id, label, depth, energy, novelty, life,
           emotionality, unresolved, last_mention_turn, created_at_turn)
        VALUES (@id, @sessionId, @parentTopicId, @label, @depth, @energy, @novelty, @life,
                @emotionality, @unresolved, @lastMentionTurn, @createdAtTurn)
        ON CONFLICT(id) DO UPDATE SET
          label = excluded.label,
          depth = excluded.depth,
          energy = excluded.energy,
          novelty = excluded.novelty,
          life = excluded.life,
          emotionality = excluded.emotionality,
          unresolved = excluded.unresolved,
          last_mention_turn = excluded.last_mention_turn
      `,
      )
      .run({
        id: topic.id,
        sessionId,
        parentTopicId: topic.parentTopicId ?? null,
        label: topic.label,
        depth: topic.depth,
        energy: topic.energy,
        novelty: topic.novelty,
        life: topic.life,
        emotionality: topic.emotionality ?? null,
        unresolved: topic.unresolved ? 1 : 0,
        lastMentionTurn: topic.lastMentionTurn ?? turnNo,
        createdAtTurn: turnNo,
      });
  }
}

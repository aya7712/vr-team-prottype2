import { describe, expect, it, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { migrate } from '../migrate.js';
import { SessionRepository } from './SessionRepository.js';
import { TopicRepository } from './TopicRepository.js';
import type { Topic } from '@prottype2/engine';

function makeTopic(overrides: Partial<Topic> = {}): Topic {
  return {
    id: 'topic_1',
    label: 'テスト話題',
    depth: 0,
    energy: 0.5,
    novelty: 0.5,
    life: 0.5,
    unresolved: false,
    ...overrides,
  };
}

describe('TopicRepository', () => {
  let db: Database.Database;

  afterEach(() => {
    db?.close();
  });

  function setupSession() {
    db = new Database(':memory:');
    migrate(db);
    new SessionRepository(db).create({
      id: 'session_1',
      scenario: {},
      participantIds: ['char_a', 'char_b'],
      status: 'running',
      initialTopic: 'テスト話題',
    });
  }

  it('upsertで新規Topicを作成できる', () => {
    setupSession();
    const repo = new TopicRepository(db);
    repo.upsert('session_1', makeTopic(), 1);

    const row = db.prepare('SELECT * FROM topics WHERE id = ?').get('topic_1') as
      Record<string, unknown> | undefined;
    expect(row).toBeDefined();
    expect(row?.label).toBe('テスト話題');
    expect(row?.created_at_turn).toBe(1);
  });

  it('同じidで再度upsertすると数値パラメータが更新されるがcreated_at_turnは保持される', () => {
    setupSession();
    const repo = new TopicRepository(db);
    repo.upsert('session_1', makeTopic({ energy: 0.5 }), 1);
    repo.upsert('session_1', makeTopic({ energy: 0.9, label: '更新後の話題' }), 5);

    const row = db.prepare('SELECT * FROM topics WHERE id = ?').get('topic_1') as
      Record<string, unknown> | undefined;
    expect(row?.energy).toBe(0.9);
    expect(row?.label).toBe('更新後の話題');
    expect(row?.created_at_turn).toBe(1);
  });

  it('parentTopicId/emotionality/lastMentionTurnが無い場合はnullで保存される', () => {
    setupSession();
    const repo = new TopicRepository(db);
    repo.upsert('session_1', makeTopic(), 3);

    const row = db.prepare('SELECT * FROM topics WHERE id = ?').get('topic_1') as
      Record<string, unknown> | undefined;
    expect(row?.parent_topic_id).toBeNull();
    expect(row?.emotionality).toBeNull();
    expect(row?.last_mention_turn).toBe(3);
  });
});

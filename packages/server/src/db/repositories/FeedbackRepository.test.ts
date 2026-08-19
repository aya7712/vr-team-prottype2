import { describe, expect, it, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { migrate } from '../migrate.js';
import { SessionRepository } from './SessionRepository.js';
import { TurnRepository } from './TurnRepository.js';
import { FeedbackRepository } from './FeedbackRepository.js';

describe('FeedbackRepository', () => {
  let db: Database.Database;

  afterEach(() => {
    db?.close();
  });

  function setupSessionAndTurn() {
    db = new Database(':memory:');
    migrate(db);
    new SessionRepository(db).create({
      id: 'session_1',
      participantIds: ['char_a', 'char_b'],
      status: 'running',
      initialTopic: 'テスト話題',
    });
    // turns.topic_idはtopics(id)を参照するFK制約があるため、先にtopicを1件用意する。
    db.prepare(
      `
      INSERT INTO topics
        (id, session_id, parent_topic_id, label, depth, energy, novelty, life, unresolved, created_at_turn)
      VALUES ('topic_1', 'session_1', NULL, 'テスト話題', 0, 0.5, 0.5, 0.5, 0, 0)
    `,
    ).run();
    new TurnRepository(db).createTurn({
      sessionId: 'session_1',
      turnNo: 1,
      speakerId: 'char_a',
      topicId: 'topic_1',
      dialogueAct: 'empathy',
      utterance: 'それは大変だったね',
      createdAt: new Date().toISOString(),
    });
  }

  it('upsertしたフィードバックをfindByTurnで取得できる', () => {
    setupSessionAndTurn();
    const repo = new FeedbackRepository(db);
    repo.upsert('session_1', 1, 'natural', 'いい感じ');

    const found = repo.findByTurn('session_1', 1);
    expect(found?.rating).toBe('natural');
    expect(found?.comment).toBe('いい感じ');
  });

  it('同一ターンへのupsertは上書きされる（PRIMARY KEY (session_id, turn_no)）', () => {
    setupSessionAndTurn();
    const repo = new FeedbackRepository(db);
    repo.upsert('session_1', 1, 'unnatural', '違和感がある');
    repo.upsert('session_1', 1, 'natural', '修正後は自然');

    const found = repo.findByTurn('session_1', 1);
    expect(found?.rating).toBe('natural');
    expect(found?.comment).toBe('修正後は自然');

    const all = db.prepare('SELECT COUNT(*) as c FROM turn_feedback').get() as { c: number };
    expect(all.c).toBe(1);
  });

  it('存在しないターンのfindByTurnはnullを返す', () => {
    setupSessionAndTurn();
    const repo = new FeedbackRepository(db);
    expect(repo.findByTurn('session_1', 99)).toBeNull();
  });

  it('commentがnullのフィードバックも保存できる', () => {
    setupSessionAndTurn();
    const repo = new FeedbackRepository(db);
    repo.upsert('session_1', 1, 'natural', null);
    expect(repo.findByTurn('session_1', 1)?.comment).toBeNull();
  });

  it('listBySessionはturn_no順にフィードバックを返す', () => {
    setupSessionAndTurn();
    const turnRepo = new TurnRepository(db);
    turnRepo.createTurn({
      sessionId: 'session_1',
      turnNo: 2,
      speakerId: 'char_b',
      topicId: 'topic_1',
      dialogueAct: 'answer',
      utterance: 'そうだね',
      createdAt: new Date().toISOString(),
    });

    const repo = new FeedbackRepository(db);
    repo.upsert('session_1', 2, 'natural', null);
    repo.upsert('session_1', 1, 'unnatural', null);

    const list = repo.listBySession('session_1');
    expect(list.map((f) => f.turnNo)).toEqual([1, 2]);
  });
});

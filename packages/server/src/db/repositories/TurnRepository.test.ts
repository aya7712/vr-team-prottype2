import { describe, expect, it, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { migrate } from '../migrate.js';
import { SessionRepository } from './SessionRepository.js';
import { TurnRepository } from './TurnRepository.js';
import type { TurnRecord } from './types.js';

function makeTurn(overrides: Partial<TurnRecord> = {}): TurnRecord {
  return {
    sessionId: 'session_1',
    turnNo: 1,
    speakerId: 'char_a',
    targetIds: ['char_b'],
    topicId: 'topic_1',
    dialogueAct: 'empathy',
    utterance: 'それは大変だったね',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('TurnRepository', () => {
  let db: Database.Database;

  afterEach(() => {
    db?.close();
  });

  function setupSession() {
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
  }

  it('createTurnしたターンをfindByTurnNoで取得できる', () => {
    setupSession();
    const repo = new TurnRepository(db);
    const turn = makeTurn();
    repo.createTurn(turn);

    const found = repo.findByTurnNo('session_1', 1);
    expect(found).toEqual(turn);
  });

  it('存在しないターンのfindByTurnNoはnullを返す', () => {
    setupSession();
    const repo = new TurnRepository(db);
    expect(repo.findByTurnNo('session_1', 99)).toBeNull();
  });

  it('listBySessionはturn_no順にターンを返す', () => {
    setupSession();
    const repo = new TurnRepository(db);
    repo.createTurn(makeTurn({ turnNo: 2, utterance: '2番目' }));
    repo.createTurn(makeTurn({ turnNo: 1, utterance: '1番目' }));

    const turns = repo.listBySession('session_1');
    expect(turns.map((t) => t.turnNo)).toEqual([1, 2]);
  });

  it('createLayerEvent/listLayerEventsでレイヤーイベントを保存・取得できる', () => {
    setupSession();
    const repo = new TurnRepository(db);
    repo.createTurn(makeTurn());

    repo.createLayerEvent('session_1', 1, 'topic', { topic: { id: 'topic_1' } });
    repo.createLayerEvent('session_1', 1, 'llm', { prompt: 'p', rawOutput: 'r' });

    const events = repo.listLayerEvents('session_1', 1);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.layer)).toEqual(['topic', 'llm']);
    expect(events[0].payload).toEqual({ topic: { id: 'topic_1' } });
  });

  it('targetIdsが無いターンも保存・復元できる', () => {
    setupSession();
    const repo = new TurnRepository(db);
    repo.createTurn(makeTurn({ targetIds: undefined }));

    const found = repo.findByTurnNo('session_1', 1);
    expect(found?.targetIds).toBeUndefined();
  });
});

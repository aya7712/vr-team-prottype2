import { describe, expect, it, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { migrate } from '../migrate.js';
import { SessionRepository } from './SessionRepository.js';

describe('SessionRepository', () => {
  let db: Database.Database;

  afterEach(() => {
    db?.close();
  });

  it('createしたセッションをfindByIdで取得できる', () => {
    db = new Database(':memory:');
    migrate(db);
    const repo = new SessionRepository(db);

    const created = repo.create({
      id: 'session_1',
      scenario: { theme: '雑談' },
      participantIds: ['char_a', 'char_b'],
      status: 'running',
    });

    expect(created.id).toBe('session_1');
    const found = repo.findById('session_1');
    expect(found).toEqual(created);
  });

  it('存在しないIDのfindByIdはnullを返す', () => {
    db = new Database(':memory:');
    migrate(db);
    const repo = new SessionRepository(db);
    expect(repo.findById('missing')).toBeNull();
  });

  it('updateStatusでstatusを更新できる', () => {
    db = new Database(':memory:');
    migrate(db);
    const repo = new SessionRepository(db);
    repo.create({
      id: 'session_1',
      scenario: {},
      participantIds: ['char_a', 'char_b'],
      status: 'running',
    });

    repo.updateStatus('session_1', 'completed');
    expect(repo.findById('session_1')?.status).toBe('completed');
  });

  it('listは作成順にすべてのセッションを返す', () => {
    db = new Database(':memory:');
    migrate(db);
    const repo = new SessionRepository(db);
    repo.create({ id: 'session_1', scenario: {}, participantIds: ['char_a'], status: 'running' });
    repo.create({ id: 'session_2', scenario: {}, participantIds: ['char_b'], status: 'running' });

    const sessions = repo.list();
    expect(sessions.map((s) => s.id)).toEqual(['session_1', 'session_2']);
  });
});

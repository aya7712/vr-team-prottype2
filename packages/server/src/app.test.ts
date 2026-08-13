import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import request from 'supertest';
import type { Express } from 'express';
import type { LlmClient } from '@prottype2/engine';
import { migrate } from './db/migrate.js';
import { createApp } from './app.js';

function makeFakeLlmClient(): LlmClient {
  return { complete: vi.fn().mockResolvedValue('「テスト発話」') };
}

function seedCharacters(db: Database.Database, ids: string[]) {
  const insert = db.prepare(`
    INSERT INTO characters_cache
      (id, name, furigana, color, age, gender, first_person, personality, tone_sample,
       vocabulary_json, ng_topics_json, unit_context_json, llm_json, raw_yaml_path, loaded_at)
    VALUES (@id, @name, NULL, '#000000', NULL, NULL, NULL, 'テスト', NULL, '[]', '[]', NULL, NULL, 'x.yaml', @loadedAt)
  `);
  for (const id of ids) {
    insert.run({ id, name: id, loadedAt: new Date().toISOString() });
  }
}

describe('REST API（architecture.md 7章）', () => {
  let db: Database.Database;
  let app: Express;

  beforeEach(() => {
    db = new Database(':memory:');
    migrate(db);
    seedCharacters(db, ['char_a', 'char_b', 'char_c']);
    app = createApp(db, { llmClient: makeFakeLlmClient() });
  });

  afterEach(() => {
    db?.close();
  });

  describe('POST /api/sessions', () => {
    it('参加キャラクター2体でセッションを作成できる', async () => {
      const res = await request(app)
        .post('/api/sessions')
        .send({ participantIds: ['char_a', 'char_b'], scenario: { theme: '雑談' } });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.status).toBe('stopped');
      expect(res.body.participantIds).toEqual(['char_a', 'char_b']);
    });

    it('参加キャラクターが1体だけだと400を返す', async () => {
      const res = await request(app)
        .post('/api/sessions')
        .send({ participantIds: ['char_a'] });
      expect(res.status).toBe(400);
    });

    it('存在しないキャラクターIDが含まれると400を返す', async () => {
      const res = await request(app)
        .post('/api/sessions')
        .send({ participantIds: ['char_a', 'char_unknown'] });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/sessions', () => {
    it('作成日時の降順でセッション一覧を返す', async () => {
      const first = await request(app)
        .post('/api/sessions')
        .send({ participantIds: ['char_a', 'char_b'] });
      const second = await request(app)
        .post('/api/sessions')
        .send({ participantIds: ['char_a', 'char_c'] });

      const res = await request(app).get('/api/sessions');

      expect(res.status).toBe(200);
      expect(res.body.map((s: { id: string }) => s.id)).toEqual([second.body.id, first.body.id]);
    });

    it('セッションが無ければ空配列を返す', async () => {
      const res = await request(app).get('/api/sessions');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('GET /api/sessions/:id', () => {
    it('作成済みセッションを取得できる', async () => {
      const created = await request(app)
        .post('/api/sessions')
        .send({ participantIds: ['char_a', 'char_b'] });

      const res = await request(app).get(`/api/sessions/${created.body.id}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(created.body.id);
    });

    it('存在しないセッションIDは404を返す', async () => {
      const res = await request(app).get('/api/sessions/missing');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/sessions/:id/run, /stop', () => {
    it('runでstatusがrunningになり、stopでstoppedに戻る', async () => {
      const created = await request(app)
        .post('/api/sessions')
        .send({ participantIds: ['char_a', 'char_b'] });
      const sessionId = created.body.id;

      // maxTurns:1でバックグラウンド実行を短時間に抑え、次のstopとの競合を避ける
      // （TurnOrchestratorはfire-and-forgetで起動するため、テストのdb.closeより
      // 後まで残らないようにする）。
      const runRes = await request(app)
        .post(`/api/sessions/${sessionId}/run`)
        .send({ maxTurns: 1 });
      expect(runRes.status).toBe(202);
      expect(runRes.body.status).toBe('running');

      const stopRes = await request(app).post(`/api/sessions/${sessionId}/stop`);
      expect(stopRes.status).toBe(200);
      expect(stopRes.body.status).toBe('stopped');

      // バックグラウンドのTurnOrchestrator.start()が完了するまで少し待ち、
      // db.close()後にアクセスされることによる例外・ログ汚染を防ぐ。
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    it('存在しないセッションへのrunは404を返す', async () => {
      const res = await request(app).post('/api/sessions/missing/run');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/sessions/:id/turns', () => {
    it('ターンが無いセッションは空配列を返す', async () => {
      const created = await request(app)
        .post('/api/sessions')
        .send({ participantIds: ['char_a', 'char_b'] });

      const res = await request(app).get(`/api/sessions/${created.body.id}/turns`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('作成済みのターンを一覧取得できる', async () => {
      const created = await request(app)
        .post('/api/sessions')
        .send({ participantIds: ['char_a', 'char_b'] });
      const sessionId = created.body.id;

      db.prepare(
        `INSERT INTO topics (id, session_id, parent_topic_id, label, depth, energy, novelty, life, unresolved, created_at_turn)
         VALUES ('topic_1', ?, NULL, 'テスト話題', 0, 0.5, 0.5, 0.5, 0, 0)`,
      ).run(sessionId);
      db.prepare(
        `INSERT INTO turns (session_id, turn_no, speaker_id, target_ids_json, topic_id, dialogue_act, utterance, created_at)
         VALUES (?, 1, 'char_a', '["char_b"]', 'topic_1', 'empathy', 'それは大変だったね', ?)`,
      ).run(sessionId, new Date().toISOString());

      const res = await request(app).get(`/api/sessions/${sessionId}/turns`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].utterance).toBe('それは大変だったね');
    });

    it('存在しないセッションのturns一覧は404を返す', async () => {
      const res = await request(app).get('/api/sessions/missing/turns');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/sessions/:id/turns/:turnNo', () => {
    it('特定ターンの詳細をレイヤーイベント込みで取得できる', async () => {
      const created = await request(app)
        .post('/api/sessions')
        .send({ participantIds: ['char_a', 'char_b'] });
      const sessionId = created.body.id;

      db.prepare(
        `INSERT INTO topics (id, session_id, parent_topic_id, label, depth, energy, novelty, life, unresolved, created_at_turn)
         VALUES ('topic_1', ?, NULL, 'テスト話題', 0, 0.5, 0.5, 0.5, 0, 0)`,
      ).run(sessionId);
      db.prepare(
        `INSERT INTO turns (session_id, turn_no, speaker_id, target_ids_json, topic_id, dialogue_act, utterance, created_at)
         VALUES (?, 1, 'char_a', NULL, 'topic_1', 'empathy', 'それは大変だったね', ?)`,
      ).run(sessionId, new Date().toISOString());
      db.prepare(
        `INSERT INTO turn_layer_events (session_id, turn_no, layer, payload_json, created_at)
         VALUES (?, 1, 'llm', '{"prompt":"p"}', ?)`,
      ).run(sessionId, new Date().toISOString());

      const res = await request(app).get(`/api/sessions/${sessionId}/turns/1`);
      expect(res.status).toBe(200);
      expect(res.body.utterance).toBe('それは大変だったね');
      expect(res.body.layerEvents).toHaveLength(1);
      expect(res.body.layerEvents[0].layer).toBe('llm');
    });

    it('存在しないターン番号は404を返す', async () => {
      const created = await request(app)
        .post('/api/sessions')
        .send({ participantIds: ['char_a', 'char_b'] });

      const res = await request(app).get(`/api/sessions/${created.body.id}/turns/99`);
      expect(res.status).toBe(404);
    });

    it('turnNoが正の整数でない場合は400を返す', async () => {
      const created = await request(app)
        .post('/api/sessions')
        .send({ participantIds: ['char_a', 'char_b'] });

      const res = await request(app).get(`/api/sessions/${created.body.id}/turns/abc`);
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/sessions/:id/turns/:turnNo/feedback', () => {
    async function createSessionWithTurn() {
      const created = await request(app)
        .post('/api/sessions')
        .send({ participantIds: ['char_a', 'char_b'] });
      const sessionId = created.body.id;
      db.prepare(
        `INSERT INTO topics (id, session_id, parent_topic_id, label, depth, energy, novelty, life, unresolved, created_at_turn)
         VALUES ('topic_1', ?, NULL, 'テスト話題', 0, 0.5, 0.5, 0.5, 0, 0)`,
      ).run(sessionId);
      db.prepare(
        `INSERT INTO turns (session_id, turn_no, speaker_id, target_ids_json, topic_id, dialogue_act, utterance, created_at)
         VALUES (?, 1, 'char_a', NULL, 'topic_1', 'empathy', 'それは大変だったね', ?)`,
      ).run(sessionId, new Date().toISOString());
      return sessionId;
    }

    it('フィードバックを登録できる', async () => {
      const sessionId = await createSessionWithTurn();

      const res = await request(app)
        .post(`/api/sessions/${sessionId}/turns/1/feedback`)
        .send({ rating: 'natural', comment: 'いい感じ' });

      expect(res.status).toBe(200);
      expect(res.body.rating).toBe('natural');
      expect(res.body.comment).toBe('いい感じ');
    });

    it('不正なratingは400を返す', async () => {
      const sessionId = await createSessionWithTurn();
      const res = await request(app)
        .post(`/api/sessions/${sessionId}/turns/1/feedback`)
        .send({ rating: 'invalid' });
      expect(res.status).toBe(400);
    });

    it('存在しないターンへのフィードバックは404を返す', async () => {
      const sessionId = await createSessionWithTurn();
      const res = await request(app)
        .post(`/api/sessions/${sessionId}/turns/99/feedback`)
        .send({ rating: 'natural' });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/characters', () => {
    it('キャッシュ済みキャラクターの一覧（id/name/furigana/color）を返す', async () => {
      const res = await request(app).get('/api/characters');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        { id: 'char_a', name: 'char_a', furigana: null, color: '#000000' },
        { id: 'char_b', name: 'char_b', furigana: null, color: '#000000' },
        { id: 'char_c', name: 'char_c', furigana: null, color: '#000000' },
      ]);
    });
  });
});

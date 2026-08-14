import { describe, expect, it, afterEach, vi } from 'vitest';
import { createServer } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import Database from 'better-sqlite3';
import { EngineEventBus } from '@prottype2/engine';
import type { LlmClient } from '@prottype2/engine';
import { migrate } from '../db/migrate.js';
import { createApp } from '../app.js';
import { attachWebSocketGateway } from './gateway.js';

function seedCharacters(db: Database.Database, ids: string[]) {
  const insert = db.prepare(`
    INSERT INTO characters_cache
      (id, name, furigana, color, age, gender, first_person, personality, tone_sample,
       vocabulary_json, ng_topics_json, unit_context_json, llm_json, raw_yaml_path, loaded_at)
    VALUES (@id, @name, NULL, '#000000', NULL, NULL, '私', @name, NULL, '[]', '[]', NULL, NULL, 'x.yaml', @loadedAt)
  `);
  for (const id of ids) {
    insert.run({ id, name: id, loadedAt: new Date().toISOString() });
  }
}

function makeFakeLlmClient(): LlmClient {
  return { complete: vi.fn().mockResolvedValue('「テストの一言」') };
}

describe('WebSocket Gateway × TurnOrchestrator（T18統合）', () => {
  let db: Database.Database;
  let httpServer: HttpServer;

  afterEach(async () => {
    db?.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it('POST /run実行中にarchitecture.md 7章のイベントが想定順序でWebSocket配信される', async () => {
    db = new Database(':memory:');
    migrate(db);
    seedCharacters(db, ['char_a', 'char_b']);

    const eventBus = new EngineEventBus();
    const app = createApp(db, { llmClient: makeFakeLlmClient(), eventBus });
    httpServer = createServer(app);
    attachWebSocketGateway(httpServer, eventBus);

    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const port = (httpServer.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });

    const receivedEventNames: string[] = [];
    const messagesByEvent: Record<string, unknown[]> = {};
    const allReceived = new Promise<void>((resolve) => {
      ws.on('message', (raw) => {
        const { event, payload } = JSON.parse(raw.toString()) as {
          event: string;
          payload: unknown;
        };
        receivedEventNames.push(event);
        (messagesByEvent[event] ??= []).push(payload);
        if (event === 'turn:complete') resolve();
      });
    });

    const createRes = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantIds: ['char_a', 'char_b'], initialTopic: 'テスト話題' }),
    });
    const session = (await createRes.json()) as { id: string };

    const runRes = await fetch(`${baseUrl}/api/sessions/${session.id}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxTurns: 1 }),
    });
    expect(runRes.status).toBe(202);

    await allReceived;
    ws.close();

    // architecture.md 7章のイベント一覧が想定順序で届く。
    expect(receivedEventNames).toEqual([
      'turn:start',
      'layer:topic',
      'layer:relationship',
      'layer:character',
      'layer:dialoguePlanner',
      'layer:memory',
      'layer:llm',
      'turn:complete',
    ]);

    expect(messagesByEvent['turn:start'][0]).toMatchObject({ turnNo: 1 });
    expect(messagesByEvent['turn:complete'][0]).toMatchObject({
      sessionId: session.id,
      turnNo: 1,
      utterance: 'テストの一言',
    });
  }, 10_000);
});

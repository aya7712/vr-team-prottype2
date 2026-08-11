import express from 'express';
import type { Express } from 'express';
import type Database from 'better-sqlite3';
import { EngineEventBus } from '@prottype2/engine';
import type { LlmClient } from '@prottype2/engine';
import { SessionRepository } from './db/repositories/SessionRepository.js';
import { TurnRepository } from './db/repositories/TurnRepository.js';
import { FeedbackRepository } from './db/repositories/FeedbackRepository.js';
import { CharacterCacheRepository } from './db/repositories/CharacterCacheRepository.js';
import { MemoryRepositoryImpl } from './db/repositories/MemoryRepositoryImpl.js';
import { TopicRepository } from './db/repositories/TopicRepository.js';
import { SessionService } from './services/SessionService.js';
import { TurnOrchestrator } from './services/TurnOrchestrator.js';
import { createSessionsRouter } from './routes/sessions.js';
import { createTurnsRouter } from './routes/turns.js';

export interface CreateAppOptions {
  llmClient: LlmClient;
  eventBus?: EngineEventBus;
}

/**
 * Expressアプリを組み立てる（architecture.md 7章のREST APIエンドポイント一覧）。
 * `eventBus`は`app.locals.eventBus`として公開する。`ws/gateway.ts`（T18）が同じ
 * インスタンスをhttp.Serverへ紐づけてWebSocketブロードキャストを行うため、
 * サーバー起動側（またはテスト）が`createApp`の外でhttp.Serverを組み立てて使う。
 */
export function createApp(db: Database.Database, options: CreateAppOptions): Express {
  const eventBus = options.eventBus ?? new EngineEventBus();

  const sessionRepository = new SessionRepository(db);
  const turnRepository = new TurnRepository(db);
  const feedbackRepository = new FeedbackRepository(db);
  const characterCacheRepository = new CharacterCacheRepository(db);
  const memoryRepository = new MemoryRepositoryImpl(db);
  const topicRepository = new TopicRepository(db);
  const sessionService = new SessionService(sessionRepository, characterCacheRepository);
  const turnOrchestrator = new TurnOrchestrator(
    sessionRepository,
    turnRepository,
    characterCacheRepository,
    memoryRepository,
    topicRepository,
    options.llmClient,
    eventBus,
  );

  const app = express();
  app.use(express.json());
  app.locals.eventBus = eventBus;

  app.use('/api/sessions', createSessionsRouter(sessionService, turnOrchestrator));
  app.use(
    '/api/sessions/:id/turns',
    createTurnsRouter(sessionService, turnRepository, feedbackRepository),
  );

  return app;
}

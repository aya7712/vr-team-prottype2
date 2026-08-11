import express from 'express';
import type { Express } from 'express';
import type Database from 'better-sqlite3';
import { SessionRepository } from './db/repositories/SessionRepository.js';
import { TurnRepository } from './db/repositories/TurnRepository.js';
import { FeedbackRepository } from './db/repositories/FeedbackRepository.js';
import { CharacterCacheRepository } from './db/repositories/CharacterCacheRepository.js';
import { SessionService } from './services/SessionService.js';
import { createSessionsRouter } from './routes/sessions.js';
import { createTurnsRouter } from './routes/turns.js';

/** Expressアプリを組み立てる（architecture.md 7章のREST APIエンドポイント一覧）。 */
export function createApp(db: Database.Database): Express {
  const sessionRepository = new SessionRepository(db);
  const turnRepository = new TurnRepository(db);
  const feedbackRepository = new FeedbackRepository(db);
  const characterCacheRepository = new CharacterCacheRepository(db);
  const sessionService = new SessionService(sessionRepository, characterCacheRepository);

  const app = express();
  app.use(express.json());

  app.use('/api/sessions', createSessionsRouter(sessionService));
  app.use(
    '/api/sessions/:id/turns',
    createTurnsRouter(sessionService, turnRepository, feedbackRepository),
  );

  return app;
}

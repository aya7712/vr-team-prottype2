import { Router } from 'express';
import type { Request, Response } from 'express';
import type { CharacterCacheRepository } from '../db/repositories/CharacterCacheRepository.js';

/**
 * `GET /api/characters`（architecture.md 7章）。`ui-design-rules.md` 2.2に従い、
 * UIがキャラクター名・キャラクターカラーを取得する唯一の情報源として提供する。
 */
export function createCharactersRouter(characterCacheRepository: CharacterCacheRepository): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    res.status(200).json(characterCacheRepository.listSummaries());
  });

  return router;
}

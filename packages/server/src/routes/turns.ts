import { Router } from 'express';
import type { Request, Response } from 'express';
import type { SessionService } from '../services/SessionService.js';
import type { TurnRepository } from '../db/repositories/TurnRepository.js';
import type { FeedbackRepository } from '../db/repositories/FeedbackRepository.js';
import type { FeedbackRating } from '../db/repositories/types.js';
import { getParam } from './params.js';

const VALID_RATINGS: FeedbackRating[] = ['natural', 'unnatural'];

// turnNoは正の整数であることを明示的に検証する（実装依存のNaN→404フォールバックに頼らない）。
function parseTurnNo(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  return Number(value);
}

/**
 * `GET /api/sessions/:id/turns`, `GET /api/sessions/:id/turns/:turnNo`,
 * `POST /api/sessions/:id/turns/:turnNo/feedback`（architecture.md 7章）。
 * `{ mergeParams: true }`で親ルーター（`/api/sessions/:id`）の`:id`を受け取る。
 */
export function createTurnsRouter(
  sessionService: SessionService,
  turnRepository: TurnRepository,
  feedbackRepository: FeedbackRepository,
): Router {
  const router = Router({ mergeParams: true });

  router.get('/', (req: Request, res: Response) => {
    const sessionId = getParam(req.params.id);
    if (!sessionService.getSession(sessionId)) {
      res.status(404).json({ error: 'session not found' });
      return;
    }
    res.status(200).json(turnRepository.listBySession(sessionId));
  });

  router.get('/:turnNo', (req: Request, res: Response) => {
    const sessionId = getParam(req.params.id);
    const turnNo = parseTurnNo(getParam(req.params.turnNo));
    if (turnNo === null) {
      res.status(400).json({ error: 'turnNo must be a positive integer' });
      return;
    }
    if (!sessionService.getSession(sessionId)) {
      res.status(404).json({ error: 'session not found' });
      return;
    }
    const turn = turnRepository.findByTurnNo(sessionId, turnNo);
    if (!turn) {
      res.status(404).json({ error: 'turn not found' });
      return;
    }
    const layerEvents = turnRepository.listLayerEvents(sessionId, turnNo);
    res.status(200).json({ ...turn, layerEvents });
  });

  router.post('/:turnNo/feedback', (req: Request, res: Response) => {
    const sessionId = getParam(req.params.id);
    const turnNo = parseTurnNo(getParam(req.params.turnNo));
    if (turnNo === null) {
      res.status(400).json({ error: 'turnNo must be a positive integer' });
      return;
    }
    if (!sessionService.getSession(sessionId)) {
      res.status(404).json({ error: 'session not found' });
      return;
    }
    if (!turnRepository.findByTurnNo(sessionId, turnNo)) {
      res.status(404).json({ error: 'turn not found' });
      return;
    }

    const { rating, comment } = req.body ?? {};
    if (!VALID_RATINGS.includes(rating)) {
      res.status(400).json({ error: `rating must be one of: ${VALID_RATINGS.join(', ')}` });
      return;
    }

    const feedback = feedbackRepository.upsert(sessionId, turnNo, rating, comment ?? null);
    res.status(200).json(feedback);
  });

  return router;
}

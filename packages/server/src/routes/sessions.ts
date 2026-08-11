import { Router } from 'express';
import type { Request, Response } from 'express';
import { SessionValidationError } from '../services/SessionService.js';
import type { SessionService } from '../services/SessionService.js';
import type { TurnOrchestrator } from '../services/TurnOrchestrator.js';
import { getParam } from './params.js';

/** `POST/GET /api/sessions`, `/run`, `/stop`（architecture.md 7章）。 */
export function createSessionsRouter(
  sessionService: SessionService,
  turnOrchestrator: TurnOrchestrator,
): Router {
  const router = Router();

  router.post('/', (req: Request, res: Response) => {
    try {
      const session = sessionService.createSession(req.body ?? {});
      res.status(201).json(session);
    } catch (err) {
      if (err instanceof SessionValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  router.get('/:id', (req: Request, res: Response) => {
    const session = sessionService.getSession(getParam(req.params.id));
    if (!session) {
      res.status(404).json({ error: 'session not found' });
      return;
    }
    res.status(200).json(session);
  });

  router.post('/:id/run', (req: Request, res: Response) => {
    const id = getParam(req.params.id);
    const existing = sessionService.getSession(id);
    if (!existing) {
      res.status(404).json({ error: 'session not found' });
      return;
    }
    const maxTurns = typeof req.body?.maxTurns === 'number' ? req.body.maxTurns : undefined;
    const session = sessionService.run(id);
    // 会話生成は非同期に開始する（architecture.md 7章「会話の自動連続生成を開始」）。
    // レスポンスは開始の受理のみを表し、生成の完了は待たない。
    turnOrchestrator.start(id, maxTurns).catch((err: unknown) => {
      console.error('TurnOrchestrator failed:', err);
    });
    res.status(202).json(session);
  });

  router.post('/:id/stop', (req: Request, res: Response) => {
    const existing = sessionService.getSession(getParam(req.params.id));
    if (!existing) {
      res.status(404).json({ error: 'session not found' });
      return;
    }
    // 実行中のTurnOrchestratorに次のターン境界での打ち切りを要求する。
    // ループが打ち切られた時点でstatusは'stopped'として確定保存される。
    turnOrchestrator.requestStop();
    const session = sessionService.stop(getParam(req.params.id));
    res.status(200).json(session);
  });

  return router;
}

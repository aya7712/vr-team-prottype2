import { Router } from 'express';
import type { Request, Response } from 'express';
import { SessionValidationError } from '../services/SessionService.js';
import type { SessionService } from '../services/SessionService.js';
import { getParam } from './params.js';

/** `POST/GET /api/sessions`, `/run`, `/stop`（architecture.md 7章）。 */
export function createSessionsRouter(sessionService: SessionService): Router {
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
    const existing = sessionService.getSession(getParam(req.params.id));
    if (!existing) {
      res.status(404).json({ error: 'session not found' });
      return;
    }
    const session = sessionService.run(getParam(req.params.id));
    res.status(202).json(session);
  });

  router.post('/:id/stop', (req: Request, res: Response) => {
    const existing = sessionService.getSession(getParam(req.params.id));
    if (!existing) {
      res.status(404).json({ error: 'session not found' });
      return;
    }
    const session = sessionService.stop(getParam(req.params.id));
    res.status(200).json(session);
  });

  return router;
}

import { Router, type RequestHandler } from 'express';

import { requireAuth } from '../auth/middleware.js';
import {
  ApiError,
  SQLITE_CONSTRAINT_CHECK,
  SQLITE_CONSTRAINT_PRIMARYKEY,
  isSqliteError,
} from '../errors.js';
import type { SessionsRepo } from '../repos/sessions.js';
import type { TasksRepo } from '../repos/tasks.js';
import { parseTask, parseTaskUpdate } from '../validation.js';

/** A task id that doesn't exist or belongs to another user is 404 either way (R4.2). */
const notFound = () => new ApiError(404, 'NOT_FOUND');

export function tasksRouter(tasks: TasksRepo, sessions: SessionsRepo) {
  const router = Router();
  router.use(requireAuth(sessions));

  const list: RequestHandler = (req, res) => {
    res.json(tasks.list(req.userId!));
  };

  const create: RequestHandler = (req, res) => {
    const task = parseTask(req.body);
    try {
      res.status(201).json(tasks.create(req.userId!, task));
    } catch (error) {
      if (isSqliteError(error, SQLITE_CONSTRAINT_PRIMARYKEY)) throw new ApiError(409, 'DUPLICATE_ID');
      if (isSqliteError(error, SQLITE_CONSTRAINT_CHECK)) throw new ApiError(400, 'INVALID_TASK');
      throw error;
    }
  };

  const update: RequestHandler<{ id: string }> = (req, res) => {
    const fields = parseTaskUpdate(req.body);
    const task = tasks.update(req.userId!, req.params.id, fields);
    if (!task) throw notFound();
    res.json(task);
  };

  const remove: RequestHandler<{ id: string }> = (req, res) => {
    if (!tasks.delete(req.userId!, req.params.id)) throw notFound();
    res.status(204).end();
  };

  router.get('/', list);
  router.post('/', create);
  router.put('/:id', update);
  router.delete('/:id', remove);

  return router;
}

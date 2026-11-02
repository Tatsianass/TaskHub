import { Router, type RequestHandler } from 'express';

import { requireAuth } from '../auth/middleware.js';
import {
  ApiError,
  PG_CHECK_VIOLATION,
  PG_UNIQUE_VIOLATION,
  isPgError,
} from '../errors.js';
import type { SessionsRepo } from '../repos/sessions.js';
import type { TasksRepo } from '../repos/tasks.js';
import { parseTask, parseTaskUpdate } from '../validation.js';

/** A task id that doesn't exist or belongs to another user is 404 either way (R4.2). */
const notFound = () => new ApiError(404, 'NOT_FOUND');

export function tasksRouter(tasks: TasksRepo, sessions: SessionsRepo) {
  const router = Router();
  router.use(requireAuth(sessions));

  const list: RequestHandler = async (req, res) => {
    res.json(await tasks.list(req.userId!));
  };

  const create: RequestHandler = async (req, res) => {
    const task = parseTask(req.body);
    try {
      res.status(201).json(await tasks.create(req.userId!, task));
    } catch (error) {
      if (isPgError(error, PG_UNIQUE_VIOLATION, 'tasks_pkey')) throw new ApiError(409, 'DUPLICATE_ID');
      if (isPgError(error, PG_CHECK_VIOLATION)) throw new ApiError(400, 'INVALID_TASK');
      throw error;
    }
  };

  const update: RequestHandler<{ id: string }> = async (req, res) => {
    const fields = parseTaskUpdate(req.body);
    const task = await tasks.update(req.userId!, req.params.id, fields);
    if (!task) throw notFound();
    res.json(task);
  };

  const remove: RequestHandler<{ id: string }> = async (req, res) => {
    if (!(await tasks.delete(req.userId!, req.params.id))) throw notFound();
    res.status(204).end();
  };

  router.get('/', list);
  router.post('/', create);
  router.put('/:id', update);
  router.delete('/:id', remove);

  return router;
}

import { Router, type RequestHandler } from 'express';

import { requireAuth } from '../auth/middleware.js';
import {
  ApiError,
  SQLITE_CONSTRAINT_CHECK,
  SQLITE_CONSTRAINT_PRIMARYKEY,
  isSqliteError,
} from '../errors.js';
import type { BirthdaysRepo } from '../repos/birthdays.js';
import type { SessionsRepo } from '../repos/sessions.js';
import { parseBirthday } from '../validation.js';

export function birthdaysRouter(birthdays: BirthdaysRepo, sessions: SessionsRepo) {
  const router = Router();
  router.use(requireAuth(sessions));

  const list: RequestHandler = (req, res) => {
    res.json(birthdays.list(req.userId!));
  };

  const create: RequestHandler = (req, res) => {
    const birthday = parseBirthday(req.body);
    try {
      res.status(201).json(birthdays.create(req.userId!, birthday));
    } catch (error) {
      if (isSqliteError(error, SQLITE_CONSTRAINT_PRIMARYKEY)) throw new ApiError(409, 'DUPLICATE_ID');
      if (isSqliteError(error, SQLITE_CONSTRAINT_CHECK)) throw new ApiError(400, 'INVALID_BIRTHDAY');
      throw error;
    }
  };

  // Unknown id and another user's id are the same 404.
  const remove: RequestHandler<{ id: string }> = (req, res) => {
    if (!birthdays.delete(req.userId!, req.params.id)) throw new ApiError(404, 'NOT_FOUND');
    res.status(204).end();
  };

  router.get('/', list);
  router.post('/', create);
  router.delete('/:id', remove);

  return router;
}

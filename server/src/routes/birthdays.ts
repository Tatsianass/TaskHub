import { Router, type RequestHandler } from 'express';

import { requireAuth } from '../auth/middleware.js';
import {
  ApiError,
  PG_CHECK_VIOLATION,
  PG_UNIQUE_VIOLATION,
  isPgError,
} from '../errors.js';
import type { BirthdaysRepo } from '../repos/birthdays.js';
import type { SessionsRepo } from '../repos/sessions.js';
import { parseBirthday } from '../validation.js';

export function birthdaysRouter(birthdays: BirthdaysRepo, sessions: SessionsRepo) {
  const router = Router();
  router.use(requireAuth(sessions));

  const list: RequestHandler = async (req, res) => {
    res.json(await birthdays.list(req.userId!));
  };

  const create: RequestHandler = async (req, res) => {
    const birthday = parseBirthday(req.body);
    try {
      res.status(201).json(await birthdays.create(req.userId!, birthday));
    } catch (error) {
      if (isPgError(error, PG_UNIQUE_VIOLATION, 'birthdays_pkey')) throw new ApiError(409, 'DUPLICATE_ID');
      if (isPgError(error, PG_CHECK_VIOLATION)) throw new ApiError(400, 'INVALID_BIRTHDAY');
      throw error;
    }
  };

  const update: RequestHandler<{ id: string }> = async (req, res) => {
    const birthday = parseBirthday(req.body);
    let updated;
    try {
      updated = await birthdays.update(req.userId!, req.params.id, birthday);
    } catch (error) {
      if (isPgError(error, PG_CHECK_VIOLATION)) throw new ApiError(400, 'INVALID_BIRTHDAY');
      throw error;
    }
    if (!updated) throw new ApiError(404, 'NOT_FOUND');
    res.json(updated);
  };

  // Unknown id and another user's id are the same 404.
  const remove: RequestHandler<{ id: string }> = async (req, res) => {
    if (!(await birthdays.delete(req.userId!, req.params.id))) throw new ApiError(404, 'NOT_FOUND');
    res.status(204).end();
  };

  router.get('/', list);
  router.post('/', create);
  router.put('/:id', update);
  router.delete('/:id', remove);

  return router;
}

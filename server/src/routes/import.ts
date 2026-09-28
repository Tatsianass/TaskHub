import type { DatabaseSync } from 'node:sqlite';

import { Router, type RequestHandler } from 'express';

import { requireAuth } from '../auth/middleware.js';
import { withTransaction } from '../db/transaction.js';
import { ApiError } from '../errors.js';
import type { BirthdaysRepo } from '../repos/birthdays.js';
import type { SessionsRepo } from '../repos/sessions.js';
import type { TasksRepo } from '../repos/tasks.js';
import { parseBirthday, parseTask } from '../validation.js';

/** `list` must be an array (or absent → []); each item is parsed with `parse`. */
function parseList<T>(list: unknown, parse: (item: unknown) => T, code: string): T[] {
  if (list === undefined) return [];
  if (!Array.isArray(list)) throw new ApiError(400, code);
  return list.map(parse);
}

/**
 * `POST /import { tasks, birthdays }`: one-time upload of the data a device
 * kept in AsyncStorage (R6). Every item is validated before anything is
 * written, and all inserts share one transaction, so an invalid item rejects
 * the whole import. Idempotent: rows the user already has are skipped (R6.2).
 */
export function importRouter(
  db: DatabaseSync,
  tasks: TasksRepo,
  birthdays: BirthdaysRepo,
  sessions: SessionsRepo,
) {
  const router = Router();

  const importData: RequestHandler = (req, res) => {
    const body = req.body as unknown;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new ApiError(400, 'INVALID_TASK');
    }
    const payload = body as { tasks?: unknown; birthdays?: unknown };
    const newTasks = parseList(payload.tasks, parseTask, 'INVALID_TASK');
    const newBirthdays = parseList(payload.birthdays, parseBirthday, 'INVALID_BIRTHDAY');

    const userId = req.userId!;
    const counts = withTransaction(db, () => ({
      tasksImported: newTasks.filter((task) => tasks.importOne(userId, task)).length,
      birthdaysImported: newBirthdays.filter((birthday) => birthdays.importOne(userId, birthday))
        .length,
    }));
    res.json(counts);
  };

  router.post('/', requireAuth(sessions), importData);

  return router;
}

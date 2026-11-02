import { Router, type RequestHandler } from 'express';

import { requireAuth } from '../auth/middleware.js';
import type { Db } from '../db/connection.js';
import { withTransaction } from '../db/transaction.js';
import { ApiError } from '../errors.js';
import { birthdaysRepo } from '../repos/birthdays.js';
import type { SessionsRepo } from '../repos/sessions.js';
import { tasksRepo } from '../repos/tasks.js';
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
export function importRouter(db: Db, sessions: SessionsRepo) {
  const router = Router();

  const importData: RequestHandler = async (req, res) => {
    const body = req.body as unknown;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new ApiError(400, 'INVALID_TASK');
    }
    const payload = body as { tasks?: unknown; birthdays?: unknown };
    const newTasks = parseList(payload.tasks, parseTask, 'INVALID_TASK');
    const newBirthdays = parseList(payload.birthdays, parseBirthday, 'INVALID_BIRTHDAY');

    const userId = req.userId!;
    // Repos bound to the transaction's connection, so every insert shares one transaction.
    const counts = await withTransaction(db, async (client) => {
      const tasks = tasksRepo(client);
      const birthdays = birthdaysRepo(client);
      let tasksImported = 0;
      for (const task of newTasks) if (await tasks.importOne(userId, task)) tasksImported += 1;
      let birthdaysImported = 0;
      for (const birthday of newBirthdays) {
        if (await birthdays.importOne(userId, birthday)) birthdaysImported += 1;
      }
      return { tasksImported, birthdaysImported };
    });
    res.json(counts);
  };

  router.post('/', requireAuth(sessions), importData);

  return router;
}

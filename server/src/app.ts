import type { DatabaseSync } from 'node:sqlite';

import cors from 'cors';
import express from 'express';

import { DEFAULT_CORS_ORIGIN } from './config.js';
import { errorHandler, notFoundHandler } from './errors.js';
import { birthdaysRepo } from './repos/birthdays.js';
import { sessionsRepo } from './repos/sessions.js';
import { tasksRepo } from './repos/tasks.js';
import { usersRepo } from './repos/users.js';
import { authRouter } from './routes/auth.js';
import { birthdaysRouter } from './routes/birthdays.js';
import { importRouter } from './routes/import.js';
import { tasksRouter } from './routes/tasks.js';

export type AppOptions = {
  corsOrigins?: string[];
};

export function createApp(db: DatabaseSync, options: AppOptions = {}) {
  const { corsOrigins = [DEFAULT_CORS_ORIGIN] } = options;
  const app = express();
  const users = usersRepo(db);
  const sessions = sessionsRepo(db);
  const tasks = tasksRepo(db);
  const birthdays = birthdaysRepo(db);

  app.disable('x-powered-by');
  app.use(cors({ origin: corsOrigins }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (req, res) => {
    res.json({ ok: db.isOpen });
  });

  app.use('/auth', authRouter(users, sessions));
  app.use('/tasks', tasksRouter(tasks, sessions));
  app.use('/birthdays', birthdaysRouter(birthdays, sessions));
  app.use('/import', importRouter(db, tasks, birthdays, sessions));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

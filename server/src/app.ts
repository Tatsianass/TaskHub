import type { DatabaseSync } from 'node:sqlite';

import cors from 'cors';
import express from 'express';

import { DEFAULT_CORS_ORIGIN } from './config.js';
import { errorHandler, notFoundHandler } from './errors.js';

export type AppOptions = {
  corsOrigins?: string[];
};

export function createApp(db: DatabaseSync, options: AppOptions = {}) {
  const { corsOrigins = [DEFAULT_CORS_ORIGIN] } = options;
  const app = express();

  app.disable('x-powered-by');
  app.use(cors({ origin: corsOrigins }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (req, res) => {
    res.json({ ok: db.isOpen });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

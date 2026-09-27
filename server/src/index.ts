import type { AddressInfo } from 'node:net';

import { createApp } from './app.js';
import { loadConfig, loadEnvFile } from './config.js';
import { closeDatabase, openDatabase } from './db/connection.js';
import { sessionsRepo } from './repos/sessions.js';

loadEnvFile();
const config = loadConfig();

const db = openDatabase(config.dbPath);
console.log(`[server] database: ${config.dbPath}`);
const expired = sessionsRepo(db).deleteExpired();
if (expired > 0) console.log(`[server] removed ${expired} expired session(s)`);

const server = createApp(db, { corsOrigins: config.corsOrigins }).listen(
  config.port,
  (error) => {
    if (error) {
      console.error(`[server] failed to listen on port ${config.port}: ${error.message}`);
      closeDatabase(db);
      process.exit(1);
    }
    const { port } = server.address() as AddressInfo;
    console.log(`[server] listening on http://localhost:${port}`);
  },
);

let shuttingDown = false;

function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} received, shutting down`);

  // Stop accepting requests; in-flight ones finish (each write is already
  // committed before its response is sent), then checkpoint and close.
  server.close(() => {
    try {
      closeDatabase(db);
      console.log('[server] database closed, bye');
      process.exit(0);
    } catch (error) {
      console.error('[server] failed to close database', error);
      process.exit(1);
    }
  });
  setTimeout(() => {
    console.error('[server] shutdown timed out, forcing exit');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

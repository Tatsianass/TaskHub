import type { AddressInfo } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';

import { createApp } from './app.js';
import { loadConfig, loadEnvFile } from './config.js';
import { closeDatabase, openDatabase } from './db/connection.js';
import { sessionsRepo } from './repos/sessions.js';

loadEnvFile();
const config = loadConfig();

/** Managed databases can be slow to wake or briefly unreachable at boot; retry before giving up. */
async function openWithRetry(attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await openDatabase({ url: config.databaseUrl, max: config.pgPoolMax, ssl: config.pgSsl });
    } catch (error) {
      if (attempt >= attempts) throw error;
      console.error(`[server] database not ready (attempt ${attempt}/${attempts}): ${(error as Error).message}`);
      await sleep(2000 * attempt);
    }
  }
}

const db = await openWithRetry().catch((error: Error) => {
  // Log host and database only: the URL holds the password.
  const { host, pathname } = new URL(config.databaseUrl);
  console.error(`[server] cannot open database ${host}${pathname}: ${error.message}`);
  process.exit(1);
});
{
  const { host, pathname } = new URL(config.databaseUrl);
  console.log(`[server] database: ${host}${pathname}`);
}

const sessions = sessionsRepo(db);
async function sweepExpiredSessions() {
  try {
    const expired = await sessions.deleteExpired();
    if (expired > 0) console.log(`[server] removed ${expired} expired session(s)`);
  } catch (error) {
    console.error('[server] session sweep failed:', (error as Error).message);
  }
}
await sweepExpiredSessions();
const sweepTimer = setInterval(sweepExpiredSessions, 60 * 60 * 1000);
sweepTimer.unref();

const server = createApp(db, {
  corsOrigins: config.corsOrigins,
  trustProxy: config.trustProxy,
  appleAudiences: config.appleAudiences,
}).listen(
  config.port,
  config.host,
  (error) => {
    if (error) {
      console.error(`[server] failed to listen on ${config.host}:${config.port}: ${error.message}`);
      void closeDatabase(db).finally(() => process.exit(1));
      return;
    }
    const { port } = server.address() as AddressInfo;
    console.log(`[server] listening on http://${config.host}:${port}`);
  },
);

let shuttingDown = false;

function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(sweepTimer);
  console.log(`[server] ${signal} received, shutting down`);

  // Stop accepting requests; in-flight ones finish (each write is already
  // committed before its response is sent), then close the pool.
  server.close(async () => {
    try {
      await closeDatabase(db);
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

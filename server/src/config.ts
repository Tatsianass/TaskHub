import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** The `server/` directory, whether running from `src/` (tsx) or `dist/` (node). */
export const SERVER_DIR = resolve(import.meta.dirname, '..');

export type Config = {
  port: number;
  /** Absolute path to the SQLite DB file. */
  dbPath: string;
  corsOrigins: string[];
};

export const DEFAULT_PORT = 4000;
export const DEFAULT_DB_PATH = 'data/app.db';
export const DEFAULT_CORS_ORIGIN = 'http://localhost:8081';

/**
 * Loads `server/.env` into `process.env` if it exists. Variables that are
 * already set in the environment are not overridden.
 */
export function loadEnvFile(path = resolve(SERVER_DIR, '.env')) {
  if (existsSync(path)) process.loadEnvFile(path);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: parsePort(env.PORT),
    // Relative paths resolve against server/, never process.cwd().
    dbPath: resolve(SERVER_DIR, env.DB_PATH?.trim() || DEFAULT_DB_PATH),
    corsOrigins: parseOrigins(env.CORS_ORIGIN),
  };
}

function parsePort(value: string | undefined) {
  if (value === undefined || value.trim() === '') return DEFAULT_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid PORT: "${value}"`);
  }
  return port;
}

function parseOrigins(value: string | undefined) {
  const origins = (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins.length > 0 ? origins : [DEFAULT_CORS_ORIGIN];
}

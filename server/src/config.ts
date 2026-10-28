import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** The `server/` directory, whether running from `src/` (tsx) or `dist/` (node). */
export const SERVER_DIR = resolve(import.meta.dirname, '..');

export type Config = {
  port: number;
  /** Interface to bind. `0.0.0.0` accepts connections from outside the container. */
  host: string;
  /** Absolute path to the SQLite DB file. */
  dbPath: string;
  corsOrigins: string[];
  /** Proxy hops in front of the server (Fly = 1); 0 when exposed directly. */
  trustProxy: number;
  /** Accepted audiences of Sign in with Apple identity tokens: the app's bundle id. */
  appleAudiences: string[];
};

export const DEFAULT_PORT = 4000;
export const DEFAULT_HOST = '0.0.0.0';
export const DEFAULT_DB_PATH = 'data/app.db';
export const DEFAULT_APPLE_AUDIENCE = 'com.tatsianas.todomobile';
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
    host: parseHost(env.HOST),
    // Relative paths resolve against server/, never process.cwd().
    dbPath: resolve(SERVER_DIR, env.DB_PATH?.trim() || DEFAULT_DB_PATH),
    corsOrigins: parseOrigins(env.CORS_ORIGIN),
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    appleAudiences: parseList(env.APPLE_BUNDLE_IDS, [DEFAULT_APPLE_AUDIENCE]),
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

function parseHost(value: string | undefined) {
  const host = value?.trim() ?? '';
  return host === '' ? DEFAULT_HOST : host;
}

function parseList(value: string | undefined, fallback: string[]) {
  const items = (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : fallback;
}

function parseOrigins(value: string | undefined) {
  return parseList(value, [DEFAULT_CORS_ORIGIN]);
}

function parseTrustProxy(value: string | undefined) {
  if (value === undefined || value.trim() === '') return 0;
  const hops = Number(value);
  if (!Number.isInteger(hops) || hops < 0) throw new Error(`Invalid TRUST_PROXY: "${value}"`);
  return hops;
}

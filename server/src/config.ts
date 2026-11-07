import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** The `server/` directory, whether running from `src/` (tsx) or `dist/` (node). */
export const SERVER_DIR = resolve(import.meta.dirname, '..');

export type Config = {
  port: number;
  /** Interface to bind. `0.0.0.0` accepts connections from outside the container. */
  host: string;
  /** Postgres connection string, without any `sslmode` (see `pgSsl`). */
  databaseUrl: string;
  pgPoolMax: number;
  /** TLS settings for the Postgres connection; `false` = plaintext. */
  pgSsl: false | { rejectUnauthorized: boolean };
  corsOrigins: string[];
  /** Proxy hops in front of the server (Fly = 1); 0 when exposed directly. */
  trustProxy: number;
  /** Accepted audiences of Sign in with Apple identity tokens: the app's bundle id. */
  appleAudiences: string[];
};

export const DEFAULT_PORT = 4000;
export const DEFAULT_HOST = '0.0.0.0';
export const DEFAULT_PG_POOL_MAX = 10;
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
    ...parseDatabase(env),
    corsOrigins: parseOrigins(env.CORS_ORIGIN),
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    appleAudiences: parseList(env.APPLE_BUNDLE_IDS, [DEFAULT_APPLE_AUDIENCE]),
  };
}

/**
 * `DATABASE_URL` is required. TLS comes from `sslmode` in the URL (`disable`, `no-verify`) and
 * otherwise defaults to verified TLS in production and plaintext elsewhere. Errors never
 * include the URL: it holds the password.
 */
function parseDatabase(env: NodeJS.ProcessEnv) {
  const raw = env.DATABASE_URL?.trim();
  if (!raw) throw new Error('DATABASE_URL is required');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('DATABASE_URL is not a valid URL');
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('DATABASE_URL must start with postgres:// or postgresql://');
  }
  const sslmode = url.searchParams.get('sslmode');
  url.searchParams.delete('sslmode');

  let pgSsl: Config['pgSsl'];
  if (sslmode === 'disable') pgSsl = false;
  else if (sslmode === 'no-verify') pgSsl = { rejectUnauthorized: false };
  else pgSsl = env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false;

  return { databaseUrl: url.toString(), pgSsl, pgPoolMax: parsePoolMax(env.PG_POOL_MAX) };
}

function parsePoolMax(value: string | undefined) {
  if (value === undefined || value.trim() === '') return DEFAULT_PG_POOL_MAX;
  const max = Number(value);
  if (!Number.isInteger(max) || max < 1 || max > 100) throw new Error(`Invalid PG_POOL_MAX: "${value}"`);
  return max;
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

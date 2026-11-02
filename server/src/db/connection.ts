import pg from 'pg';

import { runMigrations } from './migrations.js';

// BIGINT (OID 20) arrives as a string by default. Timestamps are epoch milliseconds
// (~1.8e12), far below 2^53, so a JS number holds them exactly and the API stays numeric.
pg.types.setTypeParser(20, Number);

export type Db = pg.Pool;
/** Either the pool or one checked-out client (inside a transaction). */
export type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;

export type DbOptions = {
  url: string;
  max?: number;
  ssl?: false | { rejectUnauthorized: boolean };
  /** Resolve unqualified table names in this schema first; tests use one schema per file. */
  searchPath?: string;
};

export function createPool({ url, max = 10, ssl = false, searchPath }: DbOptions) {
  const pool = new pg.Pool({
    connectionString: url,
    max,
    ssl,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 10_000,
    idle_in_transaction_session_timeout: 15_000,
    ...(searchPath && { options: `-c search_path=${searchPath}` }),
  });
  // An idle client dropped by the server must not crash the process; the pool replaces it.
  pool.on('error', (error) => console.error('[db] idle client error:', error.message));
  return pool;
}

/** Connects (failing fast if the DB is unreachable) and applies pending migrations. */
export async function openDatabase(options: DbOptions): Promise<Db> {
  const pool = createPool(options);
  try {
    await pool.query('SELECT 1');
    await runMigrations(pool);
  } catch (error) {
    await pool.end();
    throw error;
  }
  return pool;
}

export async function closeDatabase(pool: Db) {
  await pool.end();
}

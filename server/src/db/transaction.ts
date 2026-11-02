import type { PoolClient } from 'pg';

import type { Db } from './connection.js';

/**
 * Runs `fn` in one BEGIN … COMMIT on a dedicated connection; rolls back and rethrows if it
 * throws. The connection always goes back to the pool.
 */
export async function withTransaction<T>(db: Db, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

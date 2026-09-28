import type { DatabaseSync } from 'node:sqlite';

/** Runs `fn` in one BEGIN … COMMIT; rolls back and rethrows if it throws. */
export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

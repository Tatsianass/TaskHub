import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { runMigrations } from './migrations.js';

/**
 * Opens the DB file at `path`, creating it (and its directory) if missing,
 * and applies pending migrations. An existing file is re-opened as-is.
 */
export function openDatabase(path: string) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  try {
    // WAL + synchronous=FULL: a committed write survives a crash or kill -9.
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
    `);
    runMigrations(db);
  } catch (error) {
    db.close();
    throw error;
  }
  return db;
}

/** Checkpoints the WAL into the main DB file and closes the connection. */
export function closeDatabase(db: DatabaseSync) {
  if (!db.isOpen) return;
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  db.close();
}

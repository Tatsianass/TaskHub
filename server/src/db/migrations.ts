import type { DatabaseSync } from 'node:sqlite';

const V1_SQL = `
CREATE TABLE users (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash   TEXT NOT NULL,
  password_salt   TEXT NOT NULL,
  password_params TEXT NOT NULL,
  created_at      INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE tasks (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description TEXT NOT NULL DEFAULT '',
  quadrant_id TEXT NOT NULL CHECK (quadrant_id IN
    ('urgent-important','not-urgent-important','urgent-not-important','not-urgent-not-important')),
  tag         TEXT CHECK (tag IS NULL OR tag IN ('work','home')),
  done        INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0,1)),
  created_at  INTEGER NOT NULL,
  due_date    TEXT,
  remind_me   INTEGER NOT NULL DEFAULT 0 CHECK (remind_me IN (0,1)),
  remind_time TEXT
);
CREATE INDEX idx_tasks_user_created ON tasks(user_id, created_at DESC);

CREATE TABLE birthdays (
  id      TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name    TEXT NOT NULL CHECK (length(trim(name)) > 0),
  date    TEXT NOT NULL
);
CREATE INDEX idx_birthdays_user ON birthdays(user_id);
`;

const V2_SQL = `
ALTER TABLE tasks ADD COLUMN completed_at INTEGER;
`;

// Birthdays used to always remind at 09:00, so existing rows keep doing exactly that.
const V3_SQL = `
ALTER TABLE birthdays ADD COLUMN remind_me INTEGER NOT NULL DEFAULT 1 CHECK (remind_me IN (0,1));
ALTER TABLE birthdays ADD COLUMN remind_time TEXT DEFAULT '09:00';
`;

// How many days before the birthday to send a heads-up alert; NULL means no alert.
const V4_SQL = `
ALTER TABLE birthdays ADD COLUMN alert_days_before INTEGER CHECK (alert_days_before IS NULL OR alert_days_before BETWEEN 1 AND 60);
`;

/**
 * Append-only list: index 0 upgrades user_version 0 → 1, and so on.
 * Never edit or reorder a migration that has shipped; add a new one.
 */
export const MIGRATIONS: readonly string[] = [V1_SQL, V2_SQL, V3_SQL, V4_SQL];

export function getUserVersion(db: DatabaseSync) {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  return row.user_version;
}

/** Applies every pending migration, each in its own transaction. Idempotent. */
export function runMigrations(db: DatabaseSync, migrations = MIGRATIONS) {
  const current = getUserVersion(db);
  if (current > migrations.length) {
    throw new Error(
      `Database schema version ${current} is newer than this server supports (${migrations.length})`,
    );
  }
  for (let version = current; version < migrations.length; version++) {
    db.exec('BEGIN');
    try {
      db.exec(migrations[version]);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

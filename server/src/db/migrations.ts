import type { Db } from './connection.js';

// The six SQLite migrations squashed into the final schema; PG starts fresh and the copy
// script (scripts/sqlite-to-postgres.ts) brings the data over.
const V1_SQL = `
CREATE TABLE users (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL,
  password_hash   TEXT NOT NULL,
  password_salt   TEXT NOT NULL,
  password_params JSONB NOT NULL,
  created_at      BIGINT NOT NULL,
  apple_sub       TEXT
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));
CREATE UNIQUE INDEX users_apple_sub_key ON users (apple_sub) WHERE apple_sub IS NOT NULL;

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

CREATE TABLE tasks (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seq            BIGINT GENERATED ALWAYS AS IDENTITY,
  title          TEXT NOT NULL CHECK (length(btrim(title)) > 0),
  description    TEXT NOT NULL DEFAULT '',
  quadrant_id    TEXT NOT NULL CHECK (quadrant_id IN
    ('urgent-important','not-urgent-important','urgent-not-important','not-urgent-not-important')),
  tag            TEXT CHECK (tag IS NULL OR tag IN ('work','home')),
  done           BOOLEAN NOT NULL DEFAULT false,
  completed_at   BIGINT,
  created_at     BIGINT NOT NULL,
  due_date       TEXT,
  remind_me      BOOLEAN NOT NULL DEFAULT false,
  remind_time    TEXT,
  remind_offsets JSONB NOT NULL DEFAULT '[]'
);
CREATE INDEX tasks_user_created_idx ON tasks (user_id, created_at DESC, seq DESC);

CREATE TABLE birthdays (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seq               BIGINT GENERATED ALWAYS AS IDENTITY,
  name              TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  date              TEXT NOT NULL,
  remind_me         BOOLEAN NOT NULL DEFAULT true,
  remind_time       TEXT DEFAULT '09:00',
  alert_days_before INTEGER CHECK (alert_days_before IS NULL OR alert_days_before BETWEEN 1 AND 60)
);
CREATE INDEX birthdays_user_idx ON birthdays (user_id, seq);
`;

/**
 * Append-only list: index 0 is version 1, and so on.
 * Never edit or reorder a migration that has shipped; add a new one.
 */
// Repeating tasks: finishing one creates the next (the client does that); the rule is just stored.
const V2_SQL = `
ALTER TABLE tasks ADD COLUMN repeat TEXT
  CHECK (repeat IS NULL OR repeat IN ('daily','weekdays','weekly','monthly','yearly'));
`;

export const MIGRATIONS: readonly string[] = [V1_SQL, V2_SQL];

/** Arbitrary constant; every instance takes the same advisory lock while migrating. */
const MIGRATION_LOCK_ID = 727274;

export async function getSchemaVersion(db: Db) {
  const { rows } = await db.query<{ version: number }>(
    'SELECT COALESCE(max(version), 0)::int AS version FROM schema_migrations',
  );
  return rows[0].version;
}

/**
 * Applies every pending migration, each in its own transaction. Idempotent, and safe when
 * several instances boot at once: the advisory lock makes the others wait, then find nothing to do.
 */
export async function runMigrations(db: Db, migrations = MIGRATIONS) {
  // The lock is per session, so everything runs on this one connection.
  const client = await db.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    try {
      await client.query(
        `CREATE TABLE IF NOT EXISTS schema_migrations (
           version    INT PRIMARY KEY,
           applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
         )`,
      );
      const { rows } = await client.query<{ version: number }>(
        'SELECT COALESCE(max(version), 0)::int AS version FROM schema_migrations',
      );
      const current = rows[0].version;
      if (current > migrations.length) {
        throw new Error(
          `Database schema version ${current} is newer than this server supports (${migrations.length})`,
        );
      }
      for (let version = current; version < migrations.length; version++) {
        await client.query('BEGIN');
        try {
          await client.query(migrations[version]);
          await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version + 1]);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
    }
  } finally {
    client.release();
  }
}

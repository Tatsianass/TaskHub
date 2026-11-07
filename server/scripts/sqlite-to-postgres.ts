/**
 * One-off copy of the legacy SQLite database into PostgreSQL.
 *
 *   node --import tsx scripts/sqlite-to-postgres.ts --sqlite /path/app.db [--dry-run]
 *
 * Reads the SQLite file read-only and never changes it. Writes everything in one Postgres
 * transaction and refuses to run if any target table already has rows. After copying it compares
 * counts and a checksum; any mismatch rolls the whole copy back. `--dry-run` does all of that and
 * then rolls back anyway. The target is `DATABASE_URL` (server/.env is loaded).
 */
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

import type { PoolClient } from 'pg';

import { loadConfig, loadEnvFile } from '../src/config.js';
import { closeDatabase, openDatabase, type Db } from '../src/db/connection.js';
import { withTransaction } from '../src/db/transaction.js';

/** The `PRAGMA user_version` of the last SQLite schema the old server shipped. */
const LEGACY_SCHEMA_VERSION = 6;
const BATCH_SIZE = 500;
const TABLES = ['users', 'sessions', 'tasks', 'birthdays'] as const;

export type CopyOptions = {
  sqlitePath: string;
  pool: Db;
  dryRun?: boolean;
  now?: number;
  /** Runs inside the transaction after copying and before verification; tests tamper here. */
  afterCopy?: (client: PoolClient) => Promise<void>;
};

export type CopySummary = {
  users: number;
  sessions: number;
  sessionsSkipped: number;
  tasks: number;
  birthdays: number;
  dryRun: boolean;
};

type Row = Record<string, unknown>;

/** Thrown by the dry run to roll back after a successful copy and verification. */
class DryRunRollback extends Error {}

/** Multi-row `INSERT` of `rows`, `BATCH_SIZE` at a time. `columns` are in `rows` order. */
async function insertRows(
  client: PoolClient,
  table: string,
  columns: string[],
  rows: unknown[][],
  { overridingSystemValue = false } = {},
) {
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE);
    const placeholders = batch
      .map((_, r) => `(${columns.map((_, c) => `$${r * columns.length + c + 1}`).join(', ')})`)
      .join(', ');
    await client.query(
      `INSERT INTO ${table} (${columns.join(', ')}) ${overridingSystemValue ? 'OVERRIDING SYSTEM VALUE' : ''}
       VALUES ${placeholders}`,
      batch.flat(),
    );
  }
}

/** The text of a JSON column, checked so a corrupt row aborts the copy instead of vanishing. */
function jsonText(value: unknown, table: string, id: unknown, column: string) {
  try {
    JSON.parse(String(value));
  } catch {
    throw new Error(`${table} ${String(id)}: ${column} is not valid JSON`);
  }
  return String(value);
}

const bool = (value: unknown) => value === 1 || value === 1n;

function checksum(rows: { id: string; title: string; created_at: number }[]) {
  const hash = createHash('sha256');
  for (const row of [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    hash.update(`${row.id}\0${row.title}\0${row.created_at}\n`);
  }
  return hash.digest('hex');
}

function countsByUser(rows: { user_id: string; n: number }[]) {
  return JSON.stringify(rows.map((row) => [row.user_id, Number(row.n)]).sort());
}

export async function copySqliteToPostgres({
  sqlitePath,
  pool,
  dryRun = false,
  now = Date.now(),
  afterCopy,
}: CopyOptions): Promise<CopySummary> {
  const source = new DatabaseSync(sqlitePath, { readOnly: true });
  try {
    const all = (sql: string) => source.prepare(sql).all() as Row[];

    const version = (source.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
    if (version !== LEGACY_SCHEMA_VERSION) {
      throw new Error(`SQLite schema version is ${version}, expected ${LEGACY_SCHEMA_VERSION}`);
    }

    const users = all('SELECT rowid AS rid, * FROM users ORDER BY rowid');
    const allSessions = all('SELECT * FROM sessions ORDER BY rowid');
    const sessions = allSessions.filter((row) => (row.expires_at as number) > now);
    const tasks = all('SELECT rowid AS rid, * FROM tasks ORDER BY rowid');
    const birthdays = all('SELECT rowid AS rid, * FROM birthdays ORDER BY rowid');

    const summary: CopySummary = {
      users: users.length,
      sessions: sessions.length,
      sessionsSkipped: allSessions.length - sessions.length,
      tasks: tasks.length,
      birthdays: birthdays.length,
      dryRun,
    };

    try {
      await withTransaction(pool, async (client) => {
        for (const table of TABLES) {
          const { rows } = await client.query(`SELECT 1 FROM ${table} LIMIT 1`);
          if (rows.length > 0) {
            throw new Error(`Target table "${table}" is not empty; refusing to copy over existing data`);
          }
        }

        await insertRows(
          client,
          'users',
          ['id', 'email', 'password_hash', 'password_salt', 'password_params', 'created_at', 'apple_sub'],
          users.map((r) => [
            r.id,
            r.email,
            r.password_hash,
            r.password_salt,
            jsonText(r.password_params, 'users', r.id, 'password_params'),
            r.created_at,
            r.apple_sub,
          ]),
        );
        await insertRows(
          client,
          'sessions',
          ['token_hash', 'user_id', 'created_at', 'expires_at'],
          sessions.map((r) => [r.token_hash, r.user_id, r.created_at, r.expires_at]),
        );
        // seq is the SQLite rowid, so the "newest insert first" tie-break is preserved.
        await insertRows(
          client,
          'tasks',
          [
            'id', 'user_id', 'seq', 'title', 'description', 'quadrant_id', 'tag', 'done', 'completed_at',
            'created_at', 'due_date', 'remind_me', 'remind_time', 'remind_offsets',
          ],
          tasks.map((r) => [
            r.id, r.user_id, r.rid, r.title, r.description, r.quadrant_id, r.tag, bool(r.done), r.completed_at,
            r.created_at, r.due_date, bool(r.remind_me), r.remind_time,
            jsonText(r.remind_offsets, 'tasks', r.id, 'remind_offsets'),
          ]),
          { overridingSystemValue: true },
        );
        await insertRows(
          client,
          'birthdays',
          ['id', 'user_id', 'seq', 'name', 'date', 'remind_me', 'remind_time', 'alert_days_before'],
          birthdays.map((r) => [
            r.id, r.user_id, r.rid, r.name, r.date, bool(r.remind_me), r.remind_time, r.alert_days_before,
          ]),
          { overridingSystemValue: true },
        );

        // Identity columns don't advance when seq is supplied; new rows must start after the copy.
        for (const table of ['tasks', 'birthdays']) {
          await client.query(
            `SELECT setval(pg_get_serial_sequence('${table}', 'seq'), COALESCE((SELECT max(seq) FROM ${table}), 1),
                           (SELECT count(*) > 0 FROM ${table}))`,
          );
        }

        await afterCopy?.(client);
        await verify(client, source, summary, now);

        if (dryRun) throw new DryRunRollback();
      });
    } catch (error) {
      if (!(error instanceof DryRunRollback)) throw error;
    }
    return summary;
  } finally {
    source.close();
  }
}

/** Compares the copy, still uncommitted, against the source; throws on any difference. */
async function verify(client: PoolClient, source: DatabaseSync, expected: CopySummary, now: number) {
  const count = async (table: string) =>
    Number(((await client.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0] as { n: number }).n);

  const actual = {
    users: await count('users'),
    sessions: await count('sessions'),
    tasks: await count('tasks'),
    birthdays: await count('birthdays'),
  };
  for (const table of ['users', 'sessions', 'tasks', 'birthdays'] as const) {
    if (actual[table] !== expected[table]) {
      throw new Error(`Verification failed: ${table} has ${actual[table]} rows, expected ${expected[table]}`);
    }
  }

  for (const table of ['tasks', 'birthdays']) {
    const sql = `SELECT user_id, count(*) AS n FROM ${table} GROUP BY user_id`;
    const fromSource = source.prepare(sql).all() as { user_id: string; n: number }[];
    const fromTarget = (await client.query<{ user_id: string; n: number }>(sql)).rows;
    if (countsByUser(fromSource) !== countsByUser(fromTarget)) {
      throw new Error(`Verification failed: per-user ${table} counts differ`);
    }
  }

  const taskSql = 'SELECT id, title, created_at FROM tasks';
  const sourceSum = checksum(source.prepare(taskSql).all() as never);
  const targetSum = checksum((await client.query(taskSql)).rows as never);
  if (sourceSum !== targetSum) throw new Error('Verification failed: task checksum differs');

  const live = (source.prepare('SELECT count(*) AS n FROM sessions WHERE expires_at > ?').get(now) as { n: number }).n;
  if (live !== expected.sessions) throw new Error('Verification failed: unexpired session count differs');
}

function parseArgs(argv: string[]) {
  let sqlitePath: string | undefined;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--sqlite') sqlitePath = argv[++i];
    else if (argv[i] === '--dry-run') dryRun = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!sqlitePath) throw new Error('Usage: sqlite-to-postgres.ts --sqlite <path/to/app.db> [--dry-run]');
  return { sqlitePath, dryRun };
}

async function main() {
  const { sqlitePath, dryRun } = parseArgs(process.argv.slice(2));
  loadEnvFile();
  const config = loadConfig();
  const pool = await openDatabase({ url: config.databaseUrl, max: 2, ssl: config.pgSsl });
  try {
    const summary = await copySqliteToPostgres({ sqlitePath, pool, dryRun });
    console.table(summary);
    console.log(dryRun ? 'Dry run OK: verified, then rolled back. Nothing was written.' : 'Copy committed and verified.');
  } finally {
    await closeDatabase(pool);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: Error) => {
    console.error(`Copy failed: ${error.message}`);
    process.exit(1);
  });
}

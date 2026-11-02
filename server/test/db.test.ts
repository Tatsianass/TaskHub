import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { getSchemaVersion, MIGRATIONS, runMigrations } from '../src/db/migrations.js';
import { withTransaction } from '../src/db/transaction.js';
import { createTestDb } from './helpers.js';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const dbs: TestDb[] = [];
async function freshDb(options?: Parameters<typeof createTestDb>[0]) {
  const db = await createTestDb(options);
  dbs.push(db);
  return db;
}
after(async () => {
  await Promise.all(dbs.map((db) => db.drop()));
});

async function tableNames(db: TestDb) {
  const { rows } = await db.pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = $1 ORDER BY table_name`,
    [db.schema],
  );
  return rows.map((row) => row.table_name);
}

function insertUser(db: TestDb, id: string, email: string) {
  return db.pool.query(
    `INSERT INTO users (id, email, password_hash, password_salt, password_params, created_at)
     VALUES ($1, $2, 'h', 's', '{}', $3)`,
    [id, email, Date.now()],
  );
}

function insertTask(db: TestDb, userId: string, overrides: Record<string, unknown> = {}) {
  const row = {
    id: `task-${Math.random()}`,
    title: 'T',
    quadrant_id: 'urgent-important',
    tag: null,
    ...overrides,
  };
  return db.pool.query(
    `INSERT INTO tasks (id, user_id, title, quadrant_id, tag, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [row.id, userId, row.title, row.quadrant_id, row.tag, Date.now()],
  );
}

describe('migrations', () => {
  test('a fresh schema gets every table and the latest version (R2.1)', async () => {
    const db = await freshDb();
    assert.deepEqual(await tableNames(db), ['birthdays', 'schema_migrations', 'sessions', 'tasks', 'users']);
    assert.equal(await getSchemaVersion(db.pool), MIGRATIONS.length);
  });

  test('running migrations twice is a no-op', async () => {
    const db = await freshDb();
    await insertUser(db, 'u1', 'a@example.com');
    await runMigrations(db.pool);
    assert.equal(await getSchemaVersion(db.pool), MIGRATIONS.length);
    const { rows } = await db.pool.query('SELECT count(*)::int AS n FROM users');
    assert.equal(rows[0].n, 1);
  });

  test('concurrent runs apply each migration exactly once (R2.2)', async () => {
    const db = await freshDb({ migrate: false });
    const migrations = ['CREATE TABLE a (id INT)', 'CREATE TABLE b (id INT)'];
    await Promise.all([1, 2, 3, 4].map(() => runMigrations(db.pool, migrations)));
    assert.equal(await getSchemaVersion(db.pool), 2);
    const { rows } = await db.pool.query('SELECT count(*)::int AS n FROM schema_migrations');
    assert.equal(rows[0].n, 2);
  });

  test('a failing migration rolls back and throws (R2.4)', async () => {
    const db = await freshDb({ migrate: false });
    const migrations = ['CREATE TABLE ok (id INT)', 'CREATE TABLE half (id INT); SELECT nope FROM nowhere'];
    await assert.rejects(() => runMigrations(db.pool, migrations));
    assert.equal(await getSchemaVersion(db.pool), 1);
    assert.deepEqual(await tableNames(db), ['ok', 'schema_migrations']);
  });

  test('a database newer than the code refuses to start (R2.5)', async () => {
    const db = await freshDb();
    await db.pool.query('INSERT INTO schema_migrations (version) VALUES ($1)', [MIGRATIONS.length + 1]);
    await assert.rejects(() => runMigrations(db.pool), /newer than this server supports/);
  });
});

describe('constraints (R2.3)', () => {
  let db: TestDb;
  before(async () => {
    db = await freshDb();
    await insertUser(db, 'u1', 'Ann@Example.com');
  });

  const violation = (code: string) => (error: { code?: string }) => error.code === code;

  test('email is unique ignoring case', async () => {
    await assert.rejects(() => insertUser(db, 'u2', 'ann@example.COM'), violation('23505'));
  });

  test('tasks reject a blank title, a bad quadrant and a bad tag', async () => {
    await assert.rejects(() => insertTask(db, 'u1', { title: '   ' }), violation('23514'));
    await assert.rejects(() => insertTask(db, 'u1', { quadrant_id: 'nope' }), violation('23514'));
    await assert.rejects(() => insertTask(db, 'u1', { tag: 'play' }), violation('23514'));
    await insertTask(db, 'u1', { tag: 'work' });
  });

  test('a duplicate task id violates the primary key', async () => {
    await insertTask(db, 'u1', { id: 'dup' });
    await assert.rejects(() => insertTask(db, 'u1', { id: 'dup' }), violation('23505'));
  });

  test('foreign keys reject unknown users', async () => {
    await assert.rejects(() => insertTask(db, 'ghost'), violation('23503'));
  });

  test('birthdays reject a blank name and alert_days_before outside 1–60', async () => {
    const insert = (name: string, days: number | null) =>
      db.pool.query(
        `INSERT INTO birthdays (id, user_id, name, date, alert_days_before)
         VALUES ($1, 'u1', $2, '1990-01-01', $3)`,
        [`b-${Math.random()}`, name, days],
      );
    await assert.rejects(() => insert(' ', null), violation('23514'));
    await assert.rejects(() => insert('Ann', 0), violation('23514'));
    await assert.rejects(() => insert('Ann', 61), violation('23514'));
    await insert('Ann', 60);
    await insert('Ann', null);
  });

  test('apple_sub is unique only when set', async () => {
    const insert = (id: string, sub: string | null) =>
      db.pool.query(
        `INSERT INTO users (id, email, password_hash, password_salt, password_params, created_at, apple_sub)
         VALUES ($1, $2, 'h', 's', '{}', 1, $3)`,
        [id, `${id}@example.com`, sub],
      );
    await insert('n1', null);
    await insert('n2', null);
    await insert('s1', 'apple-1');
    await assert.rejects(() => insert('s2', 'apple-1'), violation('23505'));
  });

  test('deleting a user cascades to sessions, tasks and birthdays', async () => {
    await insertUser(db, 'doomed', 'doomed@example.com');
    await insertTask(db, 'doomed');
    await db.pool.query(`INSERT INTO sessions VALUES ('h', 'doomed', 1, 2)`);
    await db.pool.query(`INSERT INTO birthdays (id, user_id, name, date) VALUES ('b', 'doomed', 'N', '2000-01-01')`);
    await db.pool.query(`DELETE FROM users WHERE id = 'doomed'`);
    for (const table of ['sessions', 'tasks', 'birthdays']) {
      const { rows } = await db.pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE user_id = 'doomed'`);
      assert.equal(rows[0].n, 0, table);
    }
  });
});

describe('types (R1.3)', () => {
  test('BIGINT columns come back as numbers, jsonb as parsed values', async () => {
    const db = await freshDb();
    await insertUser(db, 'u1', 'a@example.com');
    await db.pool.query(
      `INSERT INTO tasks (id, user_id, title, quadrant_id, created_at, completed_at, remind_offsets)
       VALUES ('t', 'u1', 'T', 'urgent-important', 1790000000123, 1790000000456, '[0, 15]')`,
    );
    const { rows } = await db.pool.query('SELECT created_at, completed_at, remind_offsets, seq FROM tasks');
    assert.equal(rows[0].created_at, 1790000000123);
    assert.equal(typeof rows[0].completed_at, 'number');
    assert.equal(typeof rows[0].seq, 'number');
    assert.deepEqual(rows[0].remind_offsets, [0, 15]);
  });
});

describe('withTransaction', () => {
  test('commits on success and returns the result', async () => {
    const db = await freshDb();
    const result = await withTransaction(db.pool, async (client) => {
      await client.query(`INSERT INTO users VALUES ('u', 'a@example.com', 'h', 's', '{}', 1)`);
      return 'done';
    });
    assert.equal(result, 'done');
    const { rows } = await db.pool.query('SELECT count(*)::int AS n FROM users');
    assert.equal(rows[0].n, 1);
  });

  test('rolls back everything and rethrows when fn throws', async () => {
    const db = await freshDb();
    await assert.rejects(
      () =>
        withTransaction(db.pool, async (client) => {
          await client.query(`INSERT INTO users VALUES ('u', 'a@example.com', 'h', 's', '{}', 1)`);
          throw new Error('boom');
        }),
      /boom/,
    );
    const { rows } = await db.pool.query('SELECT count(*)::int AS n FROM users');
    assert.equal(rows[0].n, 0);
  });

  test('releases the connection even after a failed statement (R4.3)', async () => {
    const db = await freshDb();
    await Promise.allSettled(
      Array.from({ length: 50 }, () =>
        withTransaction(db.pool, (client) => client.query('SELECT * FROM does_not_exist')),
      ),
    );
    assert.equal(db.pool.totalCount, db.pool.idleCount);
    assert.equal(db.pool.waitingCount, 0);
    await db.pool.query('SELECT 1');
  });
});

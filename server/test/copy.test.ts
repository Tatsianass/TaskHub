import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, afterEach, beforeEach, describe, test } from 'node:test';

import { copySqliteToPostgres } from '../scripts/sqlite-to-postgres.js';
import { tasksRepo } from '../src/repos/tasks.js';
import { createTestDb, makeTask } from './helpers.js';
import { applyLegacySchema } from './fixtures/legacy-schema.js';

const NOW = 1_800_000_000_000;
const tmpRoot = mkdtempSync(join(tmpdir(), 'todo-copy-'));
after(() => rmSync(tmpRoot, { recursive: true, force: true }));

let counter = 0;
/** A legacy-schema SQLite file with a representative data set. Returns its path. */
function buildLegacyDb(setup?: (db: DatabaseSync) => void) {
  counter += 1;
  const path = join(tmpRoot, `legacy-${counter}.db`);
  const db = new DatabaseSync(path);
  applyLegacySchema(db);
  const user = db.prepare(
    `INSERT INTO users (id, email, password_hash, password_salt, password_params, created_at, apple_sub)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  user.run('u1', 'ann@example.com', 'hash1', 'salt1', '{"N":16384,"r":8,"p":1,"keylen":64}', 1000, null);
  user.run('u2', 'bob@example.com', 'hash2', 'salt2', '{"N":16384,"r":8,"p":1,"keylen":64}', 2000, null);
  user.run('u3', 'sub@apple.invalid', 'hash3', 'salt3', '{"N":16384,"r":8,"p":1,"keylen":64}', 3000, 'apple-sub-3');

  const session = db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?)');
  session.run('live-1', 'u1', NOW - 1000, NOW + 100_000);
  session.run('live-2', 'u2', NOW - 1000, NOW + 200_000);
  session.run('expired', 'u1', NOW - 900_000, NOW - 1);

  // Three tasks share created_at: their relative order must survive the copy.
  const task = db.prepare(
    `INSERT INTO tasks (id, user_id, title, description, quadrant_id, tag, done, completed_at, created_at,
                        due_date, remind_me, remind_time, remind_offsets)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  task.run('t1', 'u1', 'first', '', 'urgent-important', 'work', 0, null, 5000, '2026-12-01', 1, '10:00', '[0,15]');
  task.run('t2', 'u1', 'second', 'desc', 'urgent-important', null, 1, 5500, 5000, null, 0, null, '[]');
  task.run('t3', 'u1', 'third', '', 'not-urgent-not-important', 'home', 0, null, 5000, null, 0, null, '[]');
  task.run('t4', 'u2', 'bob task', '', 'urgent-not-important', null, 0, null, 100, null, 0, null, '[]');

  const birthday = db.prepare(
    `INSERT INTO birthdays (id, user_id, name, date, remind_me, remind_time, alert_days_before)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  birthday.run('b1', 'u1', 'Grandma', '1948-12-31', 1, '09:00', 7);
  birthday.run('b2', 'u1', 'Cat', '2015-02-28', 0, null, null);
  setup?.(db);
  db.close();
  return path;
}

let target: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  target = await createTestDb();
});
afterEach(() => target.drop());

const countOf = async (table: string) =>
  ((await target.pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0] as { n: number }).n;

describe('copySqliteToPostgres', () => {
  test('copies every table, preserving ids, values and order (R5.1)', async () => {
    const path = buildLegacyDb();
    const summary = await copySqliteToPostgres({ sqlitePath: path, pool: target.pool, now: NOW });
    assert.deepEqual(summary, { users: 3, sessions: 2, sessionsSkipped: 1, tasks: 4, birthdays: 2, dryRun: false });

    assert.equal(await countOf('users'), 3);
    const apple = (await target.pool.query(`SELECT apple_sub FROM users WHERE id = 'u3'`)).rows[0];
    assert.equal(apple.apple_sub, 'apple-sub-3');
    const params = (await target.pool.query(`SELECT password_params FROM users WHERE id = 'u1'`)).rows[0];
    assert.deepEqual(params.password_params, { N: 16384, r: 8, p: 1, keylen: 64 });

    // Same createdAt → newest insert first, exactly as the old server listed them.
    const listed = await tasksRepo(target.pool).list('u1');
    assert.deepEqual(listed.map((t) => t.id), ['t3', 't2', 't1']);
    assert.deepEqual(listed[2], {
      id: 't1', title: 'first', description: '', quadrantId: 'urgent-important', tag: 'work', done: false,
      completedAt: null, createdAt: 5000, dueDate: '2026-12-01', remindMe: true, remindTime: '10:00',
      remindOffsets: [0, 15],
    });
    assert.equal(listed[1].done, true);
    assert.equal(listed[1].completedAt, 5500);

    const birthdays = (await target.pool.query(`SELECT * FROM birthdays WHERE user_id = 'u1' ORDER BY seq`)).rows;
    assert.deepEqual(birthdays.map((b) => [b.id, b.remind_me, b.remind_time, b.alert_days_before]), [
      ['b1', true, '09:00', 7],
      ['b2', false, null, null],
    ]);
  });

  test('skips expired sessions and keeps live ones signed in (R5.4)', async () => {
    await copySqliteToPostgres({ sqlitePath: buildLegacyDb(), pool: target.pool, now: NOW });
    const { rows } = await target.pool.query('SELECT token_hash FROM sessions ORDER BY token_hash');
    assert.deepEqual(rows.map((r) => r.token_hash), ['live-1', 'live-2']);
  });

  test('new rows get a seq after the copied ones (sequence advanced)', async () => {
    await copySqliteToPostgres({ sqlitePath: buildLegacyDb(), pool: target.pool, now: NOW });
    await tasksRepo(target.pool).create('u1', makeTask({ id: 'new', createdAt: 5000 }));
    const listed = await tasksRepo(target.pool).list('u1');
    assert.equal(listed[0].id, 'new');
  });

  test('works on an empty legacy database', async () => {
    const path = buildLegacyDb();
    const db = new DatabaseSync(path);
    db.exec('DELETE FROM sessions; DELETE FROM tasks; DELETE FROM birthdays; DELETE FROM users');
    db.close();
    const summary = await copySqliteToPostgres({ sqlitePath: path, pool: target.pool, now: NOW });
    assert.equal(summary.users + summary.tasks + summary.birthdays + summary.sessions, 0);
    await tasksRepo(target.pool).create(
      (await target.pool.query(`INSERT INTO users VALUES ('x','x@e.com','h','s','{}',1) RETURNING id`)).rows[0].id,
      makeTask(),
    );
  });

  test('--dry-run verifies, then rolls everything back', async () => {
    const summary = await copySqliteToPostgres({
      sqlitePath: buildLegacyDb(), pool: target.pool, now: NOW, dryRun: true,
    });
    assert.equal(summary.dryRun, true);
    assert.equal(summary.tasks, 4);
    for (const table of ['users', 'sessions', 'tasks', 'birthdays']) assert.equal(await countOf(table), 0, table);
  });

  test('a second run aborts because the target is not empty (R5.2)', async () => {
    const path = buildLegacyDb();
    await copySqliteToPostgres({ sqlitePath: path, pool: target.pool, now: NOW });
    await assert.rejects(
      () => copySqliteToPostgres({ sqlitePath: path, pool: target.pool, now: NOW }),
      /not empty/,
    );
    assert.equal(await countOf('tasks'), 4);
  });

  test('refuses to copy into a table that already has rows, writing nothing (R5.2)', async () => {
    await target.pool.query(`INSERT INTO users VALUES ('existing', 'e@example.com', 'h', 's', '{}', 1)`);
    await assert.rejects(
      () => copySqliteToPostgres({ sqlitePath: buildLegacyDb(), pool: target.pool, now: NOW }),
      /not empty/,
    );
    assert.equal(await countOf('users'), 1);
  });

  test('a verification mismatch rolls back and throws (R5.3)', async () => {
    await assert.rejects(
      () =>
        copySqliteToPostgres({
          sqlitePath: buildLegacyDb(),
          pool: target.pool,
          now: NOW,
          afterCopy: async (client) => {
            await client.query(`DELETE FROM tasks WHERE id = 't4'`);
          },
        }),
      /Verification failed: tasks has 3 rows, expected 4/,
    );
    for (const table of ['users', 'sessions', 'tasks', 'birthdays']) assert.equal(await countOf(table), 0, table);
  });

  test('a changed value with equal counts is caught by the checksum (R5.3)', async () => {
    await assert.rejects(
      () =>
        copySqliteToPostgres({
          sqlitePath: buildLegacyDb(),
          pool: target.pool,
          now: NOW,
          afterCopy: async (client) => {
            await client.query(`UPDATE tasks SET title = 'tampered' WHERE id = 't1'`);
          },
        }),
      /task checksum differs/,
    );
    assert.equal(await countOf('tasks'), 0);
  });

  test('corrupt JSON aborts with the row id instead of dropping data', async () => {
    const path = buildLegacyDb((db) => {
      db.exec(`UPDATE tasks SET remind_offsets = 'not json' WHERE id = 't2'`);
    });
    await assert.rejects(
      () => copySqliteToPostgres({ sqlitePath: path, pool: target.pool, now: NOW }),
      /tasks t2: remind_offsets is not valid JSON/,
    );
    assert.equal(await countOf('users'), 0);
  });

  test('rejects a SQLite file with an unexpected schema version', async () => {
    const path = buildLegacyDb((db) => db.exec('PRAGMA user_version = 4'));
    await assert.rejects(
      () => copySqliteToPostgres({ sqlitePath: path, pool: target.pool, now: NOW }),
      /schema version is 4, expected 6/,
    );
  });

  test('never modifies the SQLite file (R5.5)', async () => {
    const path = buildLegacyDb();
    const before = readFileSync(path);
    await copySqliteToPostgres({ sqlitePath: path, pool: target.pool, now: NOW });
    await copySqliteToPostgres({ sqlitePath: path, pool: target.pool, now: NOW, dryRun: true }).catch(() => {});
    assert.deepEqual(readFileSync(path), before);
  });
});

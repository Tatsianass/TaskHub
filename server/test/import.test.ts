import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { after, before, describe, test } from 'node:test';

import { closeDatabase, openDatabase } from '../src/db/connection.js';
import { withTransaction } from '../src/db/transaction.js';
import { remappedId } from '../src/repos/import-ids.js';
import { makeBirthday, makeTask, registerUser, startApp, type TestApp } from './helpers.js';

const tmpRoot = mkdtempSync(join(tmpdir(), 'todo-import-'));
let db: DatabaseSync;
let app: TestApp;

before(async () => {
  db = openDatabase(join(tmpRoot, 'app.db'));
  app = await startApp(db);
});

after(async () => {
  await app.close();
  closeDatabase(db);
  rmSync(tmpRoot, { recursive: true, force: true });
});

function countRows(table: 'tasks' | 'birthdays', userId: string) {
  return db.prepare(`SELECT count(*) AS n FROM ${table} WHERE user_id = ?`).get(userId)?.n;
}

describe('POST /import', () => {
  test('imports tasks and birthdays and returns counts (R6.1)', async () => {
    const { token } = await registerUser(app);
    const tasks = [makeTask({ title: 'one', createdAt: 2 }), makeTask({ title: 'two', createdAt: 1 })];
    const birthdays = [makeBirthday()];

    const res = await app.request('POST', '/import', { token, body: { tasks, birthdays } });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { tasksImported: 2, birthdaysImported: 1 });
    assert.deepEqual((await app.request('GET', '/tasks', { token })).body, tasks);
    assert.deepEqual((await app.request('GET', '/birthdays', { token })).body, birthdays);
  });

  test('importing the same payload twice gives the same row count (R6.2)', async () => {
    const { token, user } = await registerUser(app);
    const body = { tasks: [makeTask(), makeTask()], birthdays: [makeBirthday(), makeBirthday()] };

    const first = await app.request('POST', '/import', { token, body });
    assert.deepEqual(first.body, { tasksImported: 2, birthdaysImported: 2 });
    const second = await app.request('POST', '/import', { token, body });
    assert.equal(second.status, 200);
    assert.deepEqual(second.body, { tasksImported: 0, birthdaysImported: 0 });

    assert.equal(countRows('tasks', user.id), 2);
    assert.equal(countRows('birthdays', user.id), 2);
  });

  test('keeps client ids; skips ids the user already has and duplicates in the payload', async () => {
    const { token } = await registerUser(app);
    const existing = makeTask({ title: 'server copy' });
    await app.request('POST', '/tasks', { token, body: existing });
    const fresh = makeTask();

    const res = await app.request('POST', '/import', {
      token,
      body: { tasks: [{ ...existing, title: 'local copy' }, fresh, { ...fresh, title: 'dup' }] },
    });
    assert.deepEqual(res.body, { tasksImported: 1, birthdaysImported: 0 });

    const listed = await app.request('GET', '/tasks', { token });
    const byId = new Map(listed.body.map((task: { id: string }) => [task.id, task]));
    assert.equal(byId.size, 2);
    assert.deepEqual(byId.get(existing.id), existing); // not overwritten
    assert.deepEqual(byId.get(fresh.id), fresh);
  });

  test('an id owned by another user is imported under a remapped id, idempotently', async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    const task = makeTask({ title: "A's task" });
    const birthday = makeBirthday({ name: "A's friend" });
    await app.request('POST', '/tasks', { token: a.token, body: task });
    await app.request('POST', '/birthdays', { token: a.token, body: birthday });

    const body = {
      tasks: [{ ...task, title: "B's task" }],
      birthdays: [{ ...birthday, name: "B's friend" }],
    };
    const first = await app.request('POST', '/import', { token: b.token, body });
    assert.deepEqual(first.body, { tasksImported: 1, birthdaysImported: 1 });
    const second = await app.request('POST', '/import', { token: b.token, body });
    assert.deepEqual(second.body, { tasksImported: 0, birthdaysImported: 0 });

    // B has one copy of each, under the remapped ids.
    const bTasks = (await app.request('GET', '/tasks', { token: b.token })).body;
    assert.deepEqual(bTasks, [{ ...task, id: remappedId(b.user.id, task.id), title: "B's task" }]);
    const bBirthdays = (await app.request('GET', '/birthdays', { token: b.token })).body;
    assert.deepEqual(bBirthdays, [
      { ...birthday, id: remappedId(b.user.id, birthday.id), name: "B's friend" },
    ]);

    // A's rows are untouched.
    assert.deepEqual((await app.request('GET', '/tasks', { token: a.token })).body, [task]);
    assert.deepEqual((await app.request('GET', '/birthdays', { token: a.token })).body, [birthday]);
  });

  test('missing lists count as empty', async () => {
    const { token } = await registerUser(app);
    const res = await app.request('POST', '/import', { token, body: {} });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { tasksImported: 0, birthdaysImported: 0 });
  });
});

describe('POST /import rejects invalid payloads as a whole', () => {
  test('one invalid task -> 400 INVALID_TASK, nothing written', async () => {
    const { token, user } = await registerUser(app);
    const res = await app.request('POST', '/import', {
      token,
      body: {
        tasks: [makeTask(), makeTask({ title: '' }), makeTask()],
        birthdays: [makeBirthday()],
      },
    });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'INVALID_TASK' });
    assert.equal(countRows('tasks', user.id), 0);
    assert.equal(countRows('birthdays', user.id), 0);
  });

  test('one invalid birthday -> 400 INVALID_BIRTHDAY, nothing written', async () => {
    const { token, user } = await registerUser(app);
    const res = await app.request('POST', '/import', {
      token,
      body: { tasks: [makeTask()], birthdays: [makeBirthday(), makeBirthday({ date: '2025-02-29' })] },
    });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'INVALID_BIRTHDAY' });
    assert.equal(countRows('tasks', user.id), 0);
    assert.equal(countRows('birthdays', user.id), 0);
  });

  const malformed: [string, unknown, string][] = [
    ['tasks not an array', { tasks: { 0: makeTask() } }, 'INVALID_TASK'],
    ['birthdays not an array', { birthdays: 'none' }, 'INVALID_BIRTHDAY'],
    ['body is an array', [makeTask()], 'INVALID_TASK'],
  ];
  for (const [name, body, code] of malformed) {
    test(`${name} -> 400 ${code}`, async () => {
      const { token } = await registerUser(app);
      const res = await app.request('POST', '/import', { token, body });
      assert.equal(res.status, 400);
      assert.deepEqual(res.body, { error: code });
    });
  }

  test('requires a session -> 401 UNAUTHORIZED', async () => {
    const res = await app.request('POST', '/import', { body: { tasks: [makeTask()] } });
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { error: 'UNAUTHORIZED' });
  });
});

describe('withTransaction', () => {
  test('rolls back every write if the callback throws', async () => {
    const { user } = await registerUser(app);
    const insert = db.prepare('INSERT INTO birthdays (id, user_id, name, date) VALUES (?, ?, ?, ?)');
    assert.throws(
      () =>
        withTransaction(db, () => {
          insert.run('tx-1', user.id, 'kept?', '2000-01-01');
          throw new Error('boom');
        }),
      /boom/,
    );
    assert.equal(db.isTransaction, false);
    assert.equal(countRows('birthdays', user.id), 0);
  });

  test('commits and returns the callback result', async () => {
    const { user } = await registerUser(app);
    const insert = db.prepare('INSERT INTO birthdays (id, user_id, name, date) VALUES (?, ?, ?, ?)');
    const result = withTransaction(db, () => insert.run('tx-2', user.id, 'kept', '2000-01-01').changes);
    assert.equal(result, 1);
    assert.equal(countRows('birthdays', user.id), 1);
  });
});

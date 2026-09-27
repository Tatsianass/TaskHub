import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { after, before, describe, test } from 'node:test';

import { closeDatabase, openDatabase } from '../src/db/connection.js';
import { makeTask, registerUser, startApp, type TestApp } from './helpers.js';

const tmpRoot = mkdtempSync(join(tmpdir(), 'todo-tasks-'));
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

describe('/tasks CRUD', () => {
  test('POST -> GET -> PUT -> DELETE round-trip (R4.1)', async () => {
    const { token } = await registerUser(app);
    const task = makeTask({
      title: 'Write report',
      description: 'Q3 numbers',
      quadrantId: 'not-urgent-important',
      tag: 'work',
      dueDate: '2026-10-01',
      remindMe: true,
      remindTime: '09:30',
    });

    const created = await app.request('POST', '/tasks', { token, body: task });
    assert.equal(created.status, 201);
    assert.deepEqual(created.body, task);

    const listed = await app.request('GET', '/tasks', { token });
    assert.equal(listed.status, 200);
    assert.deepEqual(listed.body, [task]);

    const edited = { ...task, title: 'Write final report', tag: null, done: true, remindMe: false };
    const updated = await app.request('PUT', `/tasks/${task.id}`, { token, body: edited });
    assert.equal(updated.status, 200);
    assert.deepEqual(updated.body, edited);
    assert.deepEqual((await app.request('GET', '/tasks', { token })).body, [edited]);

    const deleted = await app.request('DELETE', `/tasks/${task.id}`, { token });
    assert.equal(deleted.status, 204);
    assert.equal(deleted.body, undefined);
    assert.deepEqual((await app.request('GET', '/tasks', { token })).body, []);
  });

  test('stores the row with user_id and 0/1 booleans', async () => {
    const { token, user } = await registerUser(app);
    const task = makeTask({ done: true, remindMe: false });
    await app.request('POST', '/tasks', { token, body: task });
    const row = db.prepare('SELECT user_id, done, remind_me FROM tasks WHERE id = ?').get(task.id);
    assert.deepEqual({ ...row }, { user_id: user.id, done: 1, remind_me: 0 });
  });

  test('GET orders by createdAt desc', async () => {
    const { token } = await registerUser(app);
    const oldest = makeTask({ title: 'oldest', createdAt: 1000 });
    const newest = makeTask({ title: 'newest', createdAt: 3000 });
    const middle = makeTask({ title: 'middle', createdAt: 2000 });
    for (const task of [oldest, newest, middle]) {
      assert.equal((await app.request('POST', '/tasks', { token, body: task })).status, 201);
    }
    const res = await app.request('GET', '/tasks', { token });
    assert.deepEqual(
      res.body.map((task: { title: string }) => task.title),
      ['newest', 'middle', 'oldest'],
    );
  });

  test('PUT ignores id and createdAt in the body', async () => {
    const { token } = await registerUser(app);
    const task = makeTask({ createdAt: 1234 });
    await app.request('POST', '/tasks', { token, body: task });
    const res = await app.request('PUT', `/tasks/${task.id}`, {
      token,
      body: { ...task, id: 'other-id', createdAt: 9999, done: true },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ...task, done: true });
  });

  test('POST trims the title', async () => {
    const { token } = await registerUser(app);
    const res = await app.request('POST', '/tasks', { token, body: makeTask({ title: '  Padded  ' }) });
    assert.equal(res.body.title, 'Padded');
  });
});

describe('/tasks errors', () => {
  test('invalid body -> 400 INVALID_TASK (POST and PUT), nothing written (R4.5)', async () => {
    const { token } = await registerUser(app);
    const bad = makeTask({ quadrantId: 'someday' });
    const post = await app.request('POST', '/tasks', { token, body: bad });
    assert.equal(post.status, 400);
    assert.deepEqual(post.body, { error: 'INVALID_TASK' });
    assert.deepEqual((await app.request('GET', '/tasks', { token })).body, []);

    const task = makeTask();
    await app.request('POST', '/tasks', { token, body: task });
    const put = await app.request('PUT', `/tasks/${task.id}`, { token, body: { ...task, title: ' ' } });
    assert.equal(put.status, 400);
    assert.deepEqual(put.body, { error: 'INVALID_TASK' });
    assert.deepEqual((await app.request('GET', '/tasks', { token })).body, [task]);
  });

  test('duplicate id -> 409 DUPLICATE_ID', async () => {
    const { token } = await registerUser(app);
    const task = makeTask();
    await app.request('POST', '/tasks', { token, body: task });
    const res = await app.request('POST', '/tasks', { token, body: { ...task, title: 'again' } });
    assert.equal(res.status, 409);
    assert.deepEqual(res.body, { error: 'DUPLICATE_ID' });
  });

  test('unknown id -> 404 NOT_FOUND for PUT and DELETE', async () => {
    const { token } = await registerUser(app);
    const task = makeTask();
    const put = await app.request('PUT', `/tasks/${task.id}`, { token, body: task });
    assert.equal(put.status, 404);
    assert.deepEqual(put.body, { error: 'NOT_FOUND' });
    const del = await app.request('DELETE', `/tasks/${task.id}`, { token });
    assert.equal(del.status, 404);
    assert.deepEqual(del.body, { error: 'NOT_FOUND' });
  });

  test('every route requires a session -> 401 UNAUTHORIZED', async () => {
    const task = makeTask();
    const calls: [string, string, unknown?][] = [
      ['GET', '/tasks'],
      ['POST', '/tasks', task],
      ['PUT', `/tasks/${task.id}`, task],
      ['DELETE', `/tasks/${task.id}`],
    ];
    for (const [method, path, body] of calls) {
      const res = await app.request(method, path, { body });
      assert.equal(res.status, 401, `${method} ${path}`);
      assert.deepEqual(res.body, { error: 'UNAUTHORIZED' });
    }
  });
});

describe('/tasks isolation between users (R4.2)', () => {
  test("user B can't see, update or delete user A's task", async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    const task = makeTask({ title: "A's secret" });
    await app.request('POST', '/tasks', { token: a.token, body: task });

    assert.deepEqual((await app.request('GET', '/tasks', { token: b.token })).body, []);

    const put = await app.request('PUT', `/tasks/${task.id}`, {
      token: b.token,
      body: { ...task, title: 'hijacked' },
    });
    assert.equal(put.status, 404);
    assert.deepEqual(put.body, { error: 'NOT_FOUND' });

    const del = await app.request('DELETE', `/tasks/${task.id}`, { token: b.token });
    assert.equal(del.status, 404);
    assert.deepEqual(del.body, { error: 'NOT_FOUND' });

    // A's task is untouched.
    assert.deepEqual((await app.request('GET', '/tasks', { token: a.token })).body, [task]);
  });

  test('each user only lists their own tasks', async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    const taskA = makeTask({ title: 'A' });
    const taskB = makeTask({ title: 'B' });
    await app.request('POST', '/tasks', { token: a.token, body: taskA });
    await app.request('POST', '/tasks', { token: b.token, body: taskB });
    assert.deepEqual((await app.request('GET', '/tasks', { token: a.token })).body, [taskA]);
    assert.deepEqual((await app.request('GET', '/tasks', { token: b.token })).body, [taskB]);
  });
});

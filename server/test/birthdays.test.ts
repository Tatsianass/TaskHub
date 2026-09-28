import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { after, before, describe, test } from 'node:test';

import { closeDatabase, openDatabase } from '../src/db/connection.js';
import { makeBirthday, registerUser, startApp, type TestApp } from './helpers.js';

const tmpRoot = mkdtempSync(join(tmpdir(), 'todo-birthdays-'));
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

describe('/birthdays CRUD (R5.1)', () => {
  test('POST -> GET -> DELETE round-trip', async () => {
    const { token, user } = await registerUser(app);
    const birthday = makeBirthday({ name: 'Grandma', date: '1948-12-31' });

    const created = await app.request('POST', '/birthdays', { token, body: birthday });
    assert.equal(created.status, 201);
    assert.deepEqual(created.body, birthday);

    const row = db.prepare('SELECT user_id FROM birthdays WHERE id = ?').get(birthday.id);
    assert.equal(row?.user_id, user.id);

    const listed = await app.request('GET', '/birthdays', { token });
    assert.equal(listed.status, 200);
    assert.deepEqual(listed.body, [birthday]);

    const deleted = await app.request('DELETE', `/birthdays/${birthday.id}`, { token });
    assert.equal(deleted.status, 204);
    assert.equal(deleted.body, undefined);
    assert.deepEqual((await app.request('GET', '/birthdays', { token })).body, []);
  });

  test('GET returns birthdays in insertion order', async () => {
    const { token } = await registerUser(app);
    const list = ['C', 'A', 'B'].map((name) => makeBirthday({ name }));
    for (const birthday of list) await app.request('POST', '/birthdays', { token, body: birthday });
    assert.deepEqual((await app.request('GET', '/birthdays', { token })).body, list);
  });

  test('POST trims the name', async () => {
    const { token } = await registerUser(app);
    const res = await app.request('POST', '/birthdays', { token, body: makeBirthday({ name: ' Bob ' }) });
    assert.equal(res.body.name, 'Bob');
  });
});

describe('/birthdays errors', () => {
  test('invalid body -> 400 INVALID_BIRTHDAY, nothing written', async () => {
    const { token } = await registerUser(app);
    for (const body of [makeBirthday({ name: '' }), makeBirthday({ date: '1990-02-30' }), {}]) {
      const res = await app.request('POST', '/birthdays', { token, body });
      assert.equal(res.status, 400);
      assert.deepEqual(res.body, { error: 'INVALID_BIRTHDAY' });
    }
    assert.deepEqual((await app.request('GET', '/birthdays', { token })).body, []);
  });

  test('duplicate id -> 409 DUPLICATE_ID', async () => {
    const { token } = await registerUser(app);
    const birthday = makeBirthday();
    await app.request('POST', '/birthdays', { token, body: birthday });
    const res = await app.request('POST', '/birthdays', { token, body: birthday });
    assert.equal(res.status, 409);
    assert.deepEqual(res.body, { error: 'DUPLICATE_ID' });
  });

  test('unknown id -> 404 NOT_FOUND', async () => {
    const { token } = await registerUser(app);
    const res = await app.request('DELETE', '/birthdays/nope', { token });
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: 'NOT_FOUND' });
  });

  test('every route requires a session -> 401 UNAUTHORIZED', async () => {
    const calls: [string, string, unknown?][] = [
      ['GET', '/birthdays'],
      ['POST', '/birthdays', makeBirthday()],
      ['DELETE', '/birthdays/some-id'],
    ];
    for (const [method, path, body] of calls) {
      const res = await app.request(method, path, { body });
      assert.equal(res.status, 401, `${method} ${path}`);
      assert.deepEqual(res.body, { error: 'UNAUTHORIZED' });
    }
  });
});

describe('/birthdays isolation between users', () => {
  test("user B can't see or delete user A's birthday", async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    const birthday = makeBirthday({ name: "A's friend" });
    await app.request('POST', '/birthdays', { token: a.token, body: birthday });

    assert.deepEqual((await app.request('GET', '/birthdays', { token: b.token })).body, []);

    const del = await app.request('DELETE', `/birthdays/${birthday.id}`, { token: b.token });
    assert.equal(del.status, 404);
    assert.deepEqual(del.body, { error: 'NOT_FOUND' });

    assert.deepEqual((await app.request('GET', '/birthdays', { token: a.token })).body, [birthday]);
  });
});

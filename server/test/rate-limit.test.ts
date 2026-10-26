import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { MAX_PASSWORD_LENGTH } from '../src/routes/auth.js';
import { closeDatabase, openDatabase } from '../src/db/connection.js';
import { TEST_PASSWORD, startApp, type TestApp } from './helpers.js';

const tmpRoot = mkdtempSync(join(tmpdir(), 'todo-ratelimit-'));
let db: ReturnType<typeof openDatabase>;
let app: TestApp;

before(async () => {
  db = openDatabase(join(tmpRoot, 'app.db'));
  app = await startApp(db, { authRateLimits: { ipMax: 12, emailMax: 3, windowMs: 60_000 } });
});

after(async () => {
  await app.close();
  closeDatabase(db);
  rmSync(tmpRoot, { recursive: true, force: true });
});

const login = (email: string, password: string) =>
  app.request('POST', '/auth/login', { body: { email, password } });

describe('auth rate limiting', () => {
  test('login: the 4th attempt for one email in the window -> 429 with Retry-After', async () => {
    for (let i = 0; i < 3; i++) assert.equal((await login('victim@example.com', `wrong-pass-${i}`)).status, 404);
    const res = await login('victim@example.com', 'wrong-pass-3');
    assert.equal(res.status, 429);
    assert.deepEqual(res.body, { error: 'TOO_MANY_REQUESTS' });
    const raw = await fetch(`${app.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'victim@example.com', password: 'x' }),
    });
    assert.ok(Number(raw.headers.get('retry-after')) > 0);
  });

  test('the email limit is per email and case-insensitive', async () => {
    assert.equal((await login('  VICTIM@example.com', 'x')).status, 429);
    assert.notEqual((await login('other@example.com', 'x')).status, 429);
  });

  test('the IP limit covers register and login together', async () => {
    const strict = await startApp(db, { authRateLimits: { ipMax: 3, emailMax: 100, windowMs: 60_000 } });
    try {
      for (let i = 0; i < 2; i++) {
        const res = await strict.request('POST', '/auth/register', {
          body: { email: `ip${i}@example.com`, password: TEST_PASSWORD },
        });
        assert.equal(res.status, 201);
      }
      assert.equal((await strict.request('POST', '/auth/login', { body: { email: 'ip0@example.com', password: TEST_PASSWORD } })).status, 200);
      const res = await strict.request('POST', '/auth/register', {
        body: { email: 'ip-over@example.com', password: TEST_PASSWORD },
      });
      assert.equal(res.status, 429);
    } finally {
      await strict.close();
    }
  });

  test('authenticated routes are not rate limited', async () => {
    assert.equal((await app.request('GET', '/auth/me')).status, 401);
    assert.equal((await app.request('GET', '/health')).status, 200);
  });
});

describe('password length cap', () => {
  let open: TestApp;
  before(async () => {
    open = await startApp(db);
  });
  after(() => open.close());

  test('register: MAX_PASSWORD_LENGTH ok, one more -> 400 PASSWORD_TOO_LONG', async () => {
    const ok = await open.request('POST', '/auth/register', {
      body: { email: 'long-ok@example.com', password: 'a'.repeat(MAX_PASSWORD_LENGTH) },
    });
    assert.equal(ok.status, 201);
    const tooLong = await open.request('POST', '/auth/register', {
      body: { email: 'long-bad@example.com', password: 'a'.repeat(MAX_PASSWORD_LENGTH + 1) },
    });
    assert.equal(tooLong.status, 400);
    assert.deepEqual(tooLong.body, { error: 'PASSWORD_TOO_LONG' });
    assert.equal(db.prepare('SELECT 1 FROM users WHERE email = ?').get('long-bad@example.com'), undefined);
  });

  test('login with an oversized password -> 401 WRONG_PASSWORD, without hashing', async () => {
    const res = await open.request('POST', '/auth/login', {
      body: { email: 'long-ok@example.com', password: 'a'.repeat(100_000) },
    });
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { error: 'WRONG_PASSWORD' });
  });
});

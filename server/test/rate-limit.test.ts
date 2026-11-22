import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { EMAIL_WIDE_FAILURE_FACTOR, MAX_PASSWORD_LENGTH } from '../src/routes/auth.js';
import type { Db } from '../src/db/connection.js';
import { createTestDb, TEST_PASSWORD, startApp, type TestApp } from './helpers.js';

let testDb: Awaited<ReturnType<typeof createTestDb>>;
let db: Db;
let app: TestApp;

before(async () => {
  testDb = await createTestDb();
  db = testDb.pool;
  app = await startApp(db, { authRateLimits: { ipMax: 12, emailMax: 3, windowMs: 60_000 } });
});

after(async () => {
  await app.close();
  await testDb.drop();
});

const login = (email: string, password: string) =>
  app.request('POST', '/auth/login', { body: { email, password } });

describe('auth rate limiting', () => {
  test('login: after 3 failures for one email from one IP, the 4th -> 429 with Retry-After', async () => {
    for (let i = 0; i < 3; i++) assert.equal((await login('victim@example.com', `wrong-pass-${i}`)).status, 401);
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

  test('right passwords never count: a busy shared IP is not locked out', async () => {
    const open = await startApp(db, { authRateLimits: { ipMax: 3, emailMax: 3, windowMs: 60_000 } });
    try {
      await open.request('POST', '/auth/register', { body: { email: 'busy@example.com', password: TEST_PASSWORD } });
      for (let i = 0; i < 10; i++) {
        const res = await open.request('POST', '/auth/login', { body: { email: 'busy@example.com', password: TEST_PASSWORD } });
        assert.equal(res.status, 200, `login ${i}`);
      }
    } finally {
      await open.close();
    }
  });

  test('a success clears the failures of that email from that IP', async () => {
    const open = await startApp(db, { authRateLimits: { ipMax: 100, emailMax: 3, windowMs: 60_000 } });
    try {
      await open.request('POST', '/auth/register', { body: { email: 'forgetful@example.com', password: TEST_PASSWORD } });
      for (let round = 0; round < 3; round++) {
        for (let i = 0; i < 2; i++) {
          assert.equal((await open.request('POST', '/auth/login', { body: { email: 'forgetful@example.com', password: 'nope-nope' } })).status, 401);
        }
        assert.equal((await open.request('POST', '/auth/login', { body: { email: 'forgetful@example.com', password: TEST_PASSWORD } })).status, 200);
      }
    } finally {
      await open.close();
    }
  });

  test('failures from one IP do not lock the same email out of other IPs', async () => {
    // Another client IP is simulated through the proxy header: trust proxy = 1.
    const proxied = await startApp(db, { trustProxy: 1, authRateLimits: { ipMax: 100, emailMax: 3, windowMs: 60_000 } });
    const from = (ip: string, password: string) =>
      fetch(`${proxied.baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
        body: JSON.stringify({ email: 'owner@example.com', password }),
      });
    try {
      await proxied.request('POST', '/auth/register', { body: { email: 'owner@example.com', password: TEST_PASSWORD } });
      for (let i = 0; i < 3; i++) assert.equal((await from('203.0.113.7', `guess-${i}-xxx`)).status, 401);
      assert.equal((await from('203.0.113.7', TEST_PASSWORD)).status, 429); // the guesser is stopped...
      assert.equal((await from('198.51.100.9', TEST_PASSWORD)).status, 200); // ...the owner is not
    } finally {
      await proxied.close();
    }
  });

  test('guessing from many IPs is stopped by the email-wide limit', async () => {
    const proxied = await startApp(db, { trustProxy: 1, authRateLimits: { ipMax: 1000, emailMax: 1, windowMs: 60_000 } });
    const from = (ip: string) =>
      fetch(`${proxied.baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
        body: JSON.stringify({ email: 'spread@example.com', password: 'wrong-wrong' }),
      });
    try {
      for (let i = 0; i < EMAIL_WIDE_FAILURE_FACTOR; i++) assert.equal((await from(`192.0.2.${i + 1}`)).status, 401);
      assert.equal((await from('192.0.2.200')).status, 429);
    } finally {
      await proxied.close();
    }
  });

  test('the IP limit covers register requests; logins only count when they fail', async () => {
    const strict = await startApp(db, { authRateLimits: { ipMax: 3, emailMax: 100, windowMs: 60_000 } });
    try {
      for (let i = 0; i < 2; i++) {
        const res = await strict.request('POST', '/auth/register', {
          body: { email: `ip${i}@example.com`, password: TEST_PASSWORD },
        });
        assert.equal(res.status, 201);
      }
      assert.equal((await strict.request('POST', '/auth/login', { body: { email: 'ip0@example.com', password: TEST_PASSWORD } })).status, 200);
      assert.equal(
        (await strict.request('POST', '/auth/register', { body: { email: 'ip2@example.com', password: TEST_PASSWORD } })).status,
        201,
      );
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
    const { rowCount } = await db.query('SELECT 1 FROM users WHERE email = $1', ['long-bad@example.com']);
    assert.equal(rowCount, 0);
  });

  test('login with an oversized password -> 401 INVALID_CREDENTIALS, without hashing', async () => {
    const res = await open.request('POST', '/auth/login', {
      body: { email: 'long-ok@example.com', password: 'a'.repeat(100_000) },
    });
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { error: 'INVALID_CREDENTIALS' });
  });
});

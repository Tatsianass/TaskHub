import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { after, before, describe, test } from 'node:test';

import { closeDatabase, openDatabase } from '../src/db/connection.js';
import { SESSION_TTL_MS, sessionsRepo } from '../src/repos/sessions.js';
import { startApp } from './helpers.js';

const tmpRoot = mkdtempSync(join(tmpdir(), 'todo-auth-'));
let db: DatabaseSync;
let app: Awaited<ReturnType<typeof startApp>>;

before(async () => {
  db = openDatabase(join(tmpRoot, 'app.db'));
  app = await startApp(db);
});

after(async () => {
  await app.close();
  closeDatabase(db);
  rmSync(tmpRoot, { recursive: true, force: true });
});

let counter = 0;
function uniqueEmail() {
  counter += 1;
  return `user${counter}@example.com`;
}

const PASSWORD = 's3cret-pass';

async function register(email = uniqueEmail(), password = PASSWORD) {
  const res = await app.request('POST', '/auth/register', { body: { email, password } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body as { token: string; user: { id: string; email: string } };
}

describe('POST /auth/register', () => {
  test('201 { token, user } and stores the account in the users table (R1.1, R2.1)', async () => {
    const email = uniqueEmail();
    const { token, user } = await register(email);
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.deepEqual(Object.keys(user).sort(), ['email', 'id']);
    assert.equal(user.email, email);

    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    assert.equal(row?.email, email);
    assert.equal(JSON.stringify(row).includes(PASSWORD), false);
  });

  test('normalizes email: trim + lowercase (R1.3)', async () => {
    const { user } = await register('  New.User@Example.COM ');
    assert.equal(user.email, 'new.user@example.com');
  });

  const empty: [string, unknown][] = [
    ['empty email', { email: '', password: PASSWORD }],
    ['whitespace email', { email: '   ', password: PASSWORD }],
    ['empty password', { email: 'x@example.com', password: '' }],
    ['missing fields', {}],
    ['non-string fields', { email: 42, password: ['a'] }],
    ['no body', undefined],
  ];
  for (const [name, body] of empty) {
    test(`${name} -> 400 ENTER_EMAIL_PASSWORD (R1.5)`, async () => {
      const res = await app.request('POST', '/auth/register', { body });
      assert.equal(res.status, 400);
      assert.deepEqual(res.body, { error: 'ENTER_EMAIL_PASSWORD' });
    });
  }

  test('password of 7 chars -> 400 PASSWORD_TOO_SHORT, 8 chars ok (R1.6)', async () => {
    const res = await app.request('POST', '/auth/register', {
      body: { email: uniqueEmail(), password: '1234567' },
    });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'PASSWORD_TOO_SHORT' });
    await register(uniqueEmail(), '12345678');
  });

  test('already registered email (any case/whitespace) -> 409 EMAIL_TAKEN (R1.4)', async () => {
    const email = uniqueEmail();
    await register(email);
    const res = await app.request('POST', '/auth/register', {
      body: { email: ` ${email.toUpperCase()} `, password: PASSWORD },
    });
    assert.equal(res.status, 409);
    assert.deepEqual(res.body, { error: 'EMAIL_TAKEN' });
  });
});

describe('POST /auth/login', () => {
  test('200 { token, user } with a new session token (R2.1)', async () => {
    const registered = await register();
    const res = await app.request('POST', '/auth/login', {
      body: { email: registered.user.email, password: PASSWORD },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.user, registered.user);
    assert.match(res.body.token, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(res.body.token, registered.token);
  });

  test('" Foo@Bar.com " and "foo@bar.com" are the same account (R1.3)', async () => {
    const registered = await register(' Foo@Bar.com ');
    const res = await app.request('POST', '/auth/login', {
      body: { email: 'foo@bar.com', password: PASSWORD },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.id, registered.user.id);
  });

  test('empty credentials -> 400 ENTER_EMAIL_PASSWORD', async () => {
    const res = await app.request('POST', '/auth/login', { body: { email: 'a@b.c', password: '' } });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'ENTER_EMAIL_PASSWORD' });
  });

  test('unknown email -> 404 USER_NOT_FOUND (R2.7)', async () => {
    const res = await app.request('POST', '/auth/login', {
      body: { email: 'nobody@example.com', password: PASSWORD },
    });
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: 'USER_NOT_FOUND' });
  });

  test('wrong password -> 401 WRONG_PASSWORD (R2.7)', async () => {
    const { user } = await register();
    const res = await app.request('POST', '/auth/login', {
      body: { email: user.email, password: `${PASSWORD}x` },
    });
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { error: 'WRONG_PASSWORD' });
  });
});

describe('GET /auth/me', () => {
  test('register -> me works', async () => {
    const { token, user } = await register();
    const res = await app.request('GET', '/auth/me', { token });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { user });
  });

  test('no Authorization header -> 401 UNAUTHORIZED', async () => {
    const res = await app.request('GET', '/auth/me');
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { error: 'UNAUTHORIZED' });
  });

  test('malformed Authorization header -> 401 UNAUTHORIZED', async () => {
    const { token } = await register();
    for (const header of [token, `Basic ${token}`, 'Bearer', 'Bearer a b']) {
      const res = await fetch(`${app.baseUrl}/auth/me`, { headers: { Authorization: header } });
      assert.equal(res.status, 401, header);
      assert.deepEqual(await res.json(), { error: 'UNAUTHORIZED' });
    }
  });

  test('scheme is case-insensitive', async () => {
    const { token } = await register();
    const res = await fetch(`${app.baseUrl}/auth/me`, { headers: { Authorization: `bearer ${token}` } });
    assert.equal(res.status, 200);
  });

  test('unknown token -> 401 UNAUTHORIZED', async () => {
    const res = await app.request('GET', '/auth/me', { token: 'A'.repeat(43) });
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { error: 'UNAUTHORIZED' });
  });

  test('expired token -> 401 SESSION_EXPIRED, then UNAUTHORIZED once removed (R2.3)', async () => {
    const { user } = await register();
    const { token } = sessionsRepo(db).create(user.id, Date.now() - SESSION_TTL_MS - 1000);

    const first = await app.request('GET', '/auth/me', { token });
    assert.equal(first.status, 401);
    assert.deepEqual(first.body, { error: 'SESSION_EXPIRED' });

    const second = await app.request('GET', '/auth/me', { token });
    assert.deepEqual(second.body, { error: 'UNAUTHORIZED' });
  });
});

describe('POST /auth/logout', () => {
  test('204, deletes the session; me then returns 401 (R2.4)', async () => {
    const { token, user } = await register();
    const res = await app.request('POST', '/auth/logout', { token });
    assert.equal(res.status, 204);
    assert.equal(res.body, undefined);

    const me = await app.request('GET', '/auth/me', { token });
    assert.equal(me.status, 401);
    assert.deepEqual(me.body, { error: 'UNAUTHORIZED' });

    const rows = db.prepare('SELECT count(*) AS n FROM sessions WHERE user_id = ?').get(user.id);
    assert.equal(rows?.n, 0);
  });

  test('only ends the session it was called with', async () => {
    const { token, user } = await register();
    const login = await app.request('POST', '/auth/login', {
      body: { email: user.email, password: PASSWORD },
    });
    await app.request('POST', '/auth/logout', { token });
    const me = await app.request('GET', '/auth/me', { token: login.body.token });
    assert.equal(me.status, 200);
  });

  test('without a token -> 401 UNAUTHORIZED', async () => {
    const res = await app.request('POST', '/auth/logout');
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { error: 'UNAUTHORIZED' });
  });
});

describe('persistence of credentials', () => {
  test('only the session token hash is stored (R2.2)', async () => {
    const { token } = await register();
    const dump = JSON.stringify(db.prepare('SELECT * FROM sessions').all());
    assert.equal(dump.includes(token), false);
  });
});

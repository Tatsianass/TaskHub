import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import type { StoredPassword } from '../src/auth/password.js';
import { hashToken, newToken } from '../src/auth/tokens.js';
import type { Db } from '../src/db/connection.js';
import { SESSION_TTL_MS, sessionsRepo, type SessionsRepo } from '../src/repos/sessions.js';
import { usersRepo, type UsersRepo } from '../src/repos/users.js';
import { createTestDb } from './helpers.js';

const password: StoredPassword = {
  hash: 'aGFzaA==',
  salt: 'c2FsdA==',
  params: { N: 16384, r: 8, p: 1, keylen: 64 },
};

let testDb: Awaited<ReturnType<typeof createTestDb>>;
let db: Db;
let users: UsersRepo;
let sessions: SessionsRepo;

before(async () => {
  testDb = await createTestDb();
  db = testDb.pool;
  users = usersRepo(db);
  sessions = sessionsRepo(db);
});

after(() => testDb.drop());

// Tables are shared by the tests of this file; start each from empty.
beforeEach(async () => {
  await db.query('TRUNCATE users CASCADE');
});

describe('tokens', () => {
  test('newToken is 32 random bytes, base64url', () => {
    const token = newToken();
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(Buffer.from(token, 'base64url').length, 32);
    assert.notEqual(newToken(), token);
  });

  test('hashToken is sha256 hex and deterministic', () => {
    const token = newToken();
    assert.match(hashToken(token), /^[0-9a-f]{64}$/);
    assert.equal(hashToken(token), hashToken(token));
    assert.notEqual(hashToken(token), hashToken(newToken()));
  });
});

describe('usersRepo', () => {
  test('create + findByEmail + findById', async () => {
    const user = await users.create('a@example.com', password);
    assert.match(user.id, /^[0-9a-f-]{36}$/);
    assert.deepEqual(await users.findByEmail('a@example.com'), { ...user, password });
    assert.deepEqual(await users.findById(user.id), user);
  });

  test('missing user -> undefined', async () => {
    assert.equal(await users.findByEmail('nobody@example.com'), undefined);
    assert.equal(await users.findById('nope'), undefined);
  });

  test('duplicate email throws a unique violation, case-insensitively (R1.3)', async () => {
    await users.create('a@example.com', password);
    await assert.rejects(
      () => users.create('A@EXAMPLE.com', password),
      (error: { code?: string; constraint?: string }) =>
        error.code === '23505' && error.constraint === 'users_email_key',
    );
  });

  test('findByEmail ignores case', async () => {
    const user = await users.create('a@example.com', password);
    assert.equal((await users.findByEmail('A@Example.COM'))?.id, user.id);
  });

  test('password params are stored as JSON next to the hash', async () => {
    const user = await users.create('a@example.com', password);
    const { rows } = await db.query('SELECT password_params FROM users WHERE id = $1', [user.id]);
    assert.deepEqual(rows[0].password_params, password.params);
  });
});

describe('sessionsRepo', () => {
  let userId: string;
  beforeEach(async () => {
    userId = (await users.create('a@example.com', password)).id;
  });

  test('create stores only the token hash (R2.1, R2.2)', async () => {
    const now = Date.now();
    const { token, expiresAt } = await sessions.create(userId, now);
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(expiresAt, now + SESSION_TTL_MS);

    const { rows } = await db.query('SELECT * FROM sessions');
    assert.equal(rows.length, 1);
    assert.notEqual(rows[0].token_hash, token);
    assert.equal(rows[0].token_hash, hashToken(token));
    assert.equal(JSON.stringify(rows).includes(token), false);
  });

  test('session expires 30 days after creation (R2.3)', async () => {
    assert.equal(SESSION_TTL_MS, 30 * 24 * 60 * 60 * 1000);
    const now = Date.now();
    const { token } = await sessions.create(userId, now);
    const tokenHash = hashToken(token);

    assert.deepEqual(await sessions.findValid(tokenHash, now), {
      tokenHash,
      userId,
      expiresAt: now + SESSION_TTL_MS,
    });
    assert.ok(await sessions.findValid(tokenHash, now + SESSION_TTL_MS - 1));
    assert.equal(await sessions.findValid(tokenHash, now + SESSION_TTL_MS), undefined);
  });

  test('expired session is not returned', async () => {
    const { token } = await sessions.create(userId, Date.now() - SESSION_TTL_MS - 1000);
    assert.equal(await sessions.findValid(hashToken(token)), undefined);
  });

  test('unknown token -> undefined', async () => {
    assert.equal(await sessions.findValid(hashToken(newToken())), undefined);
  });

  test('delete removes the session and reports whether it existed', async () => {
    const { token } = await sessions.create(userId);
    const tokenHash = hashToken(token);
    assert.equal(await sessions.delete(tokenHash), true);
    assert.equal(await sessions.findValid(tokenHash), undefined);
    assert.equal(await sessions.delete(tokenHash), false);
  });

  test('deleteExpired removes only expired sessions', async () => {
    const live = await sessions.create(userId);
    await sessions.create(userId, Date.now() - SESSION_TTL_MS - 1000);
    await sessions.create(userId, Date.now() - SESSION_TTL_MS - 2000);

    assert.equal(await sessions.deleteExpired(), 2);
    assert.ok(await sessions.findValid(hashToken(live.token)));
    assert.equal(await sessions.deleteExpired(), 0);
  });

  test('sessions are deleted with their user', async () => {
    const { token } = await sessions.create(userId);
    await db.query('DELETE FROM users WHERE id = $1', [userId]);
    assert.equal(await sessions.findValid(hashToken(token)), undefined);
  });
});

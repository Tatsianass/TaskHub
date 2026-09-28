import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { after, afterEach, beforeEach, describe, test } from 'node:test';

import type { StoredPassword } from '../src/auth/password.js';
import { hashToken, newToken } from '../src/auth/tokens.js';
import { closeDatabase, openDatabase } from '../src/db/connection.js';
import { SESSION_TTL_MS, sessionsRepo, type SessionsRepo } from '../src/repos/sessions.js';
import { usersRepo, type UsersRepo } from '../src/repos/users.js';

const tmpRoot = mkdtempSync(join(tmpdir(), 'todo-repos-'));
after(() => rmSync(tmpRoot, { recursive: true, force: true }));

const password: StoredPassword = {
  hash: 'aGFzaA==',
  salt: 'c2FsdA==',
  params: { N: 16384, r: 8, p: 1, keylen: 64 },
};

let counter = 0;
let db: DatabaseSync;
let users: UsersRepo;
let sessions: SessionsRepo;

beforeEach(() => {
  counter += 1;
  db = openDatabase(join(tmpRoot, `case-${counter}.db`));
  users = usersRepo(db);
  sessions = sessionsRepo(db);
});

afterEach(() => closeDatabase(db));

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
  test('create + findByEmail + findById', () => {
    const user = users.create('a@example.com', password);
    assert.match(user.id, /^[0-9a-f-]{36}$/);
    assert.deepEqual(users.findByEmail('a@example.com'), { ...user, password });
    assert.deepEqual(users.findById(user.id), user);
  });

  test('missing user -> undefined', () => {
    assert.equal(users.findByEmail('nobody@example.com'), undefined);
    assert.equal(users.findById('nope'), undefined);
  });

  test('duplicate email throws a UNIQUE constraint error, case-insensitively (R1.3)', () => {
    users.create('a@example.com', password);
    assert.throws(
      () => users.create('A@EXAMPLE.com', password),
      (error: { errcode?: number }) => error.errcode === 2067, // SQLITE_CONSTRAINT_UNIQUE
    );
  });

  test('password params are stored as JSON next to the hash', () => {
    const user = users.create('a@example.com', password);
    const row = db.prepare('SELECT password_params FROM users WHERE id = ?').get(user.id);
    assert.deepEqual(JSON.parse(String(row?.password_params)), password.params);
  });
});

describe('sessionsRepo', () => {
  let userId: string;
  beforeEach(() => {
    userId = users.create('a@example.com', password).id;
  });

  test('create stores only the token hash (R2.1, R2.2)', () => {
    const now = Date.now();
    const { token, expiresAt } = sessions.create(userId, now);
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(expiresAt, now + SESSION_TTL_MS);

    const rows = db.prepare('SELECT * FROM sessions').all();
    assert.equal(rows.length, 1);
    assert.notEqual(rows[0].token_hash, token);
    assert.equal(rows[0].token_hash, hashToken(token));
    assert.equal(JSON.stringify(rows).includes(token), false);
  });

  test('session expires 30 days after creation (R2.3)', () => {
    assert.equal(SESSION_TTL_MS, 30 * 24 * 60 * 60 * 1000);
    const now = Date.now();
    const { token } = sessions.create(userId, now);
    const tokenHash = hashToken(token);

    assert.deepEqual(sessions.findValid(tokenHash, now), {
      tokenHash,
      userId,
      expiresAt: now + SESSION_TTL_MS,
    });
    assert.ok(sessions.findValid(tokenHash, now + SESSION_TTL_MS - 1));
    assert.equal(sessions.findValid(tokenHash, now + SESSION_TTL_MS), undefined);
  });

  test('expired session is not returned', () => {
    const { token } = sessions.create(userId, Date.now() - SESSION_TTL_MS - 1000);
    assert.equal(sessions.findValid(hashToken(token)), undefined);
  });

  test('unknown token -> undefined', () => {
    assert.equal(sessions.findValid(hashToken(newToken())), undefined);
  });

  test('delete removes the session and reports whether it existed', () => {
    const { token } = sessions.create(userId);
    const tokenHash = hashToken(token);
    assert.equal(sessions.delete(tokenHash), true);
    assert.equal(sessions.findValid(tokenHash), undefined);
    assert.equal(sessions.delete(tokenHash), false);
  });

  test('deleteExpired removes only expired sessions', () => {
    const live = sessions.create(userId);
    sessions.create(userId, Date.now() - SESSION_TTL_MS - 1000);
    sessions.create(userId, Date.now() - SESSION_TTL_MS - 2000);

    assert.equal(sessions.deleteExpired(), 2);
    assert.ok(sessions.findValid(hashToken(live.token)));
    assert.equal(sessions.deleteExpired(), 0);
  });

  test('sessions are deleted with their user', () => {
    const { token } = sessions.create(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    assert.equal(sessions.findValid(hashToken(token)), undefined);
  });
});

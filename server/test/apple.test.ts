import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { after, before, describe, test } from 'node:test';

import { createAppleVerifier, type AppleJwk } from '../src/auth/apple.js';
import { closeDatabase, openDatabase } from '../src/db/connection.js';
import { startApp, TEST_PASSWORD } from './helpers.js';

const AUDIENCE = 'com.example.app';
const NONCE = 'raw-nonce-123';
const NOW = 1_800_000_000_000;

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'key-1', alg: 'RS256', use: 'sig' } as AppleJwk;
const otherKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

function makeToken(
  claims: Record<string, unknown> = {},
  { key = privateKey, header = {} }: { key?: KeyObject; header?: Record<string, unknown> } = {},
) {
  const head = b64({ alg: 'RS256', kid: 'key-1', ...header });
  const body = b64({
    iss: 'https://appleid.apple.com',
    aud: AUDIENCE,
    exp: NOW / 1000 + 600,
    sub: 'apple-user-1',
    nonce: sha256(NONCE),
    email: 'Person@Example.com',
    email_verified: 'true',
    ...claims,
  });
  const signature = sign('RSA-SHA256', Buffer.from(`${head}.${body}`), key).toString('base64url');
  return `${head}.${body}.${signature}`;
}

function verifier(fetchKeys = async () => [jwk]) {
  return createAppleVerifier({ audiences: [AUDIENCE], fetchKeys, now: () => NOW });
}

async function rejects(promise: Promise<unknown>, status: number, code: string) {
  await assert.rejects(promise, (e: any) => e.status === status && e.code === code);
}

describe('createAppleVerifier', () => {
  test('accepts a valid token and normalizes the email', async () => {
    const identity = await verifier()(makeToken(), NONCE);
    assert.deepEqual(identity, { sub: 'apple-user-1', email: 'person@example.com', emailVerified: true });
  });

  test('email may be missing, email_verified may be a boolean', async () => {
    const identity = await verifier()(makeToken({ email: undefined, email_verified: true }), NONCE);
    assert.equal(identity.email, null);
    assert.equal(identity.emailVerified, true);
  });

  test('rejects a token signed by another key', async () => {
    await rejects(verifier()(makeToken({}, { key: otherKey }), NONCE), 401, 'INVALID_APPLE_TOKEN');
  });

  test('rejects a tampered payload', async () => {
    const [h, , s] = makeToken().split('.');
    const forged = `${h}.${b64({ iss: 'https://appleid.apple.com', aud: AUDIENCE, sub: 'victim', exp: NOW, nonce: sha256(NONCE) })}.${s}`;
    await rejects(verifier()(forged, NONCE), 401, 'INVALID_APPLE_TOKEN');
  });

  test('rejects alg none and non-RS256 headers', async () => {
    await rejects(verifier()(makeToken({}, { header: { alg: 'none' } }), NONCE), 401, 'INVALID_APPLE_TOKEN');
    await rejects(verifier()(makeToken({}, { header: { alg: 'HS256' } }), NONCE), 401, 'INVALID_APPLE_TOKEN');
  });

  test('rejects wrong issuer, audience, expired and missing sub', async () => {
    for (const claims of [
      { iss: 'https://evil.example.com' },
      { aud: 'com.other.app' },
      { exp: NOW / 1000 - 1 },
      { sub: undefined },
      { sub: '' },
    ]) {
      await rejects(verifier()(makeToken(claims), NONCE), 401, 'INVALID_APPLE_TOKEN');
    }
  });

  test('rejects a nonce that does not match, or is missing', async () => {
    await rejects(verifier()(makeToken(), 'another-nonce'), 401, 'INVALID_APPLE_TOKEN');
    await rejects(verifier()(makeToken({ nonce: undefined }), NONCE), 401, 'INVALID_APPLE_TOKEN');
  });

  test('rejects garbage', async () => {
    for (const bad of ['', 'abc', 'a.b.c', 'a.b']) {
      await rejects(verifier()(bad, NONCE), 401, 'INVALID_APPLE_TOKEN');
    }
  });

  test('unknown kid is invalid; Apple key server down is 503', async () => {
    await rejects(verifier()(makeToken({}, { header: { kid: 'nope' } }), NONCE), 401, 'INVALID_APPLE_TOKEN');
    const down = verifier(async () => {
      throw new Error('offline');
    });
    await rejects(down(makeToken(), NONCE), 503, 'APPLE_UNAVAILABLE');
  });

  test('keys are cached between calls', async () => {
    let fetches = 0;
    const cached = verifier(async () => {
      fetches += 1;
      return [jwk];
    });
    await cached(makeToken(), NONCE);
    await cached(makeToken(), NONCE);
    assert.equal(fetches, 1);
  });
});

describe('POST /auth/apple', () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'todo-apple-'));
  let db: DatabaseSync;
  let app: Awaited<ReturnType<typeof startApp>>;

  before(async () => {
    db = openDatabase(join(tmpRoot, 'app.db'));
    app = await startApp(db, { appleVerifier: verifier() });
  });

  after(async () => {
    await app.close();
    closeDatabase(db);
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  const signIn = (claims: Record<string, unknown> = {}) =>
    app.request('POST', '/auth/apple', { body: { identityToken: makeToken(claims), nonce: NONCE } });

  test('first sign-in creates an account (201), the next one reuses it (200)', async () => {
    const first = await signIn({ sub: 'new-user', email: 'new@example.com' });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.user.email, 'new@example.com');

    const second = await signIn({ sub: 'new-user', email: undefined });
    assert.equal(second.status, 200);
    assert.equal(second.body.user.id, first.body.user.id);
    assert.notEqual(second.body.token, first.body.token);
  });

  test('the session works for tasks and /auth/me, and logout kills it', async () => {
    const { body } = await signIn({ sub: 'session-user' });
    assert.equal((await app.request('GET', '/auth/me', { token: body.token })).status, 200);
    assert.equal((await app.request('GET', '/tasks', { token: body.token })).status, 200);
    await app.request('POST', '/auth/logout', { token: body.token });
    assert.equal((await app.request('GET', '/auth/me', { token: body.token })).status, 401);
  });

  test('does not take over an existing email account', async () => {
    const reg = await app.request('POST', '/auth/register', {
      body: { email: 'taken@example.com', password: TEST_PASSWORD },
    });
    const res = await signIn({ sub: 'other-apple', email: 'taken@example.com' });
    assert.equal(res.status, 201);
    assert.notEqual(res.body.user.id, reg.body.user.id);
    assert.equal(res.body.user.email, 'other-apple@apple.invalid');
  });

  test('an unverified or missing Apple email gets a placeholder', async () => {
    const unverified = await signIn({ sub: 'u1', email: 'u1@example.com', email_verified: 'false' });
    assert.equal(unverified.body.user.email, 'u1@apple.invalid');
    const missing = await signIn({ sub: 'u2', email: undefined });
    assert.equal(missing.body.user.email, 'u2@apple.invalid');
  });

  test('an Apple account cannot log in with email and a guessed password', async () => {
    await signIn({ sub: 'pw-user', email: 'pw@example.com' });
    const res = await app.request('POST', '/auth/login', {
      body: { email: 'pw@example.com', password: TEST_PASSWORD },
    });
    assert.equal(res.status, 401);
  });

  test('deleting the account lets the same Apple id start fresh', async () => {
    const first = await signIn({ sub: 'del-user' });
    assert.equal((await app.request('DELETE', '/auth/account', { token: first.body.token })).status, 204);
    const again = await signIn({ sub: 'del-user' });
    assert.equal(again.status, 201);
    assert.notEqual(again.body.user.id, first.body.user.id);
  });

  test('bad requests: 400 for missing fields, 401 for a forged token', async () => {
    for (const body of [{}, { identityToken: makeToken() }, { nonce: NONCE }, { identityToken: 5, nonce: NONCE }]) {
      const res = await app.request('POST', '/auth/apple', { body });
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'INVALID_APPLE_TOKEN');
    }
    const forged = await app.request('POST', '/auth/apple', {
      body: { identityToken: makeToken({}, { key: otherKey }), nonce: NONCE },
    });
    assert.equal(forged.status, 401);
    const huge = await app.request('POST', '/auth/apple', { body: { identityToken: 'x'.repeat(9000), nonce: NONCE } });
    assert.equal(huge.status, 400);
  });
});

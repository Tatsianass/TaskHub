import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { after, before, describe, test } from 'node:test';

import { appleClientSecret, createAppleRevoker, type AppleCredentials } from '../src/auth/apple-revoke.js';
import type { Db } from '../src/db/connection.js';
import { createTestDb, startApp } from './helpers.js';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const credentials: AppleCredentials = {
  teamId: 'TEAM123',
  keyId: 'KEY123',
  privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
  clientId: 'com.example.app',
};
const NOW = 1_800_000_000_000;

const idToken = (sub: string) => `x.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.y`;
const json = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });

type Call = { url: string; params: URLSearchParams };

/** A fake Apple: records form posts and answers with the next queued response. */
function fakeApple(...responses: Response[]) {
  const calls: Call[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url, params: new URLSearchParams(String(init.body)) });
    return responses.shift() ?? json(500);
  }) as unknown as typeof fetch;
  return { calls, revoker: createAppleRevoker(credentials, { fetchFn, now: () => NOW }) };
}

async function rejects(promise: Promise<unknown>, status: number, code: string) {
  await assert.rejects(promise, (e: any) => e.status === status && e.code === code);
}

describe('appleClientSecret', () => {
  test('is an ES256 JWT for the team, signed with the key', () => {
    const [head, body, signature] = appleClientSecret(credentials, NOW).split('.');
    assert.deepEqual(JSON.parse(Buffer.from(head, 'base64url').toString()), { alg: 'ES256', kid: 'KEY123' });
    assert.deepEqual(JSON.parse(Buffer.from(body, 'base64url').toString()), {
      iss: 'TEAM123',
      iat: NOW / 1000,
      exp: NOW / 1000 + 300,
      aud: 'https://appleid.apple.com',
      sub: 'com.example.app',
    });
    const ok = verify(
      'sha256',
      Buffer.from(`${head}.${body}`),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(signature, 'base64url'),
    );
    assert.equal(ok, true);
  });
});

describe('createAppleRevoker', () => {
  test('exchanges the code, then revokes the refresh token', async () => {
    const { calls, revoker } = fakeApple(json(200, { refresh_token: 'r1', id_token: idToken('sub-1') }), json(200));
    await revoker('code-1', 'sub-1');

    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, 'https://appleid.apple.com/auth/token');
    assert.equal(calls[0].params.get('code'), 'code-1');
    assert.equal(calls[0].params.get('grant_type'), 'authorization_code');
    assert.equal(calls[0].params.get('client_id'), 'com.example.app');
    assert.equal(calls[1].url, 'https://appleid.apple.com/auth/revoke');
    assert.equal(calls[1].params.get('token'), 'r1');
    assert.equal(calls[1].params.get('token_type_hint'), 'refresh_token');
  });

  test("another Apple id's code is refused and nothing is revoked", async () => {
    const { calls, revoker } = fakeApple(json(200, { refresh_token: 'r1', id_token: idToken('someone-else') }));
    await rejects(revoker('code', 'sub-1'), 403, 'APPLE_ACCOUNT_MISMATCH');
    assert.equal(calls.length, 1);
  });

  test('a rejected code is 401, Apple being down is 502', async () => {
    await rejects(fakeApple(json(400, { error: 'invalid_grant' })).revoker('c', 's'), 401, 'INVALID_APPLE_TOKEN');
    await rejects(fakeApple(json(503)).revoker('c', 's'), 502, 'APPLE_UNAVAILABLE');
    const down = createAppleRevoker(credentials, {
      fetchFn: (async () => {
        throw new Error('network');
      }) as unknown as typeof fetch,
    });
    await rejects(down('c', 's'), 502, 'APPLE_UNAVAILABLE');
  });

  test('a failed revoke is an error too', async () => {
    const { revoker } = fakeApple(json(200, { refresh_token: 'r1', id_token: idToken('s') }), json(503));
    await rejects(revoker('c', 's'), 502, 'APPLE_UNAVAILABLE');
  });
});

describe('DELETE /auth/account with Apple revocation', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>;
  let db: Db;

  before(async () => {
    testDb = await createTestDb();
    db = testDb.pool;
  });
  after(() => testDb.drop());

  async function appleUser(sub: string) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO users (id, email, password_hash, password_salt, password_params, created_at, apple_sub)
       VALUES (gen_random_uuid()::text, $1, 'h', 's', '{}', 0, $2) RETURNING id`,
      [`${sub}@apple.invalid`, sub],
    );
    const { sessionsRepo } = await import('../src/repos/sessions.js');
    return { id: rows[0].id, token: (await sessionsRepo(db).create(rows[0].id)).token };
  }
  const exists = async (id: string) => (await db.query('SELECT 1 FROM users WHERE id = $1', [id])).rowCount === 1;

  test('an Apple account needs a code; with one it is revoked, then deleted', async () => {
    const seen: [string, string][] = [];
    const app = await startApp(db, { appleRevoker: async (code, sub) => void seen.push([code, sub]) });
    try {
      const user = await appleUser('apple-del-1');

      const missing = await app.request('DELETE', '/auth/account', { token: user.token });
      assert.equal(missing.status, 400);
      assert.deepEqual(missing.body, { error: 'APPLE_REAUTH_REQUIRED' });
      assert.equal(await exists(user.id), true);

      const done = await app.request('DELETE', '/auth/account', { token: user.token, body: { authorizationCode: 'abc' } });
      assert.equal(done.status, 204);
      assert.deepEqual(seen, [['abc', 'apple-del-1']]);
      assert.equal(await exists(user.id), false);
    } finally {
      await app.close();
    }
  });

  test('if Apple refuses, the account is kept so the user can try again', async () => {
    const { ApiError } = await import('../src/errors.js');
    const app = await startApp(db, {
      appleRevoker: async () => {
        throw new ApiError(502, 'APPLE_UNAVAILABLE');
      },
    });
    try {
      const user = await appleUser('apple-del-2');
      const res = await app.request('DELETE', '/auth/account', { token: user.token, body: { authorizationCode: 'abc' } });
      assert.equal(res.status, 502);
      assert.equal(await exists(user.id), true);
    } finally {
      await app.close();
    }
  });

  test('email accounts, and servers without Apple keys, delete as before', async () => {
    const withRevoker = await startApp(db, {
      appleRevoker: async () => assert.fail('must not be called for an email account'),
    });
    const without = await startApp(db);
    try {
      const email = await withRevoker.request('POST', '/auth/register', {
        body: { email: 'plain@example.com', password: 'password-123' },
      });
      assert.equal((await withRevoker.request('DELETE', '/auth/account', { token: email.body.token })).status, 204);

      const user = await appleUser('apple-del-3');
      assert.equal((await without.request('DELETE', '/auth/account', { token: user.token })).status, 204);
    } finally {
      await withRevoker.close();
      await without.close();
    }
  });
});

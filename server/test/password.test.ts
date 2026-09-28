import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { DUMMY_HASH, SCRYPT_PARAMS, hashPassword, verifyPassword } from '../src/auth/password.js';

describe('password hashing (R1.2, R1.7)', () => {
  const password = 'correct horse battery';

  test('correct password verifies', async () => {
    const stored = await hashPassword(password);
    assert.equal(await verifyPassword(password, stored), true);
  });

  test('wrong password fails', async () => {
    const stored = await hashPassword(password);
    assert.equal(await verifyPassword('correct horse battery!', stored), false);
    assert.equal(await verifyPassword('', stored), false);
  });

  test('two hashes of the same password differ (per-user salt)', async () => {
    const a = await hashPassword(password);
    const b = await hashPassword(password);
    assert.notEqual(a.salt, b.salt);
    assert.notEqual(a.hash, b.hash);
  });

  test('uses scrypt params and a salt of at least 16 bytes', async () => {
    const stored = await hashPassword(password);
    assert.deepEqual(stored.params, { N: 16384, r: 8, p: 1, keylen: 64 });
    assert.equal(Buffer.from(stored.salt, 'base64').length, 16);
    assert.equal(Buffer.from(stored.hash, 'base64').length, 64);
  });

  test('stored value does not contain the password', async () => {
    const stored = await hashPassword(password);
    const serialized = JSON.stringify(stored);
    assert.doesNotMatch(serialized, /correct horse/);
    assert.doesNotMatch(serialized, new RegExp(Buffer.from(password).toString('base64')));
  });

  test('verification uses the params stored alongside the hash', async () => {
    const stored = await hashPassword(password);
    const otherParams = { ...stored, params: { ...SCRYPT_PARAMS, N: 1024 } };
    assert.equal(await verifyPassword(password, otherParams), false);
  });

  test('a hash of unexpected length fails instead of throwing', async () => {
    const stored = await hashPassword(password);
    const truncated = { ...stored, hash: Buffer.from(stored.hash, 'base64').subarray(0, 32).toString('base64') };
    assert.equal(await verifyPassword(password, truncated), false);
  });

  test('DUMMY_HASH is a real scrypt hash nobody knows the password for', async () => {
    assert.deepEqual(DUMMY_HASH.params, SCRYPT_PARAMS);
    assert.equal(await verifyPassword('', DUMMY_HASH), false);
    assert.equal(await verifyPassword(password, DUMMY_HASH), false);
  });
});

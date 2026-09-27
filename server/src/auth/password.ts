import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

export type ScryptParams = { N: number; r: number; p: number; keylen: number };

/** What the `users` table stores: base64 hash + salt, and the params used. */
export type StoredPassword = { hash: string; salt: string; params: ScryptParams };

export const SCRYPT_PARAMS: ScryptParams = { N: 16384, r: 8, p: 1, keylen: 64 };
const SALT_BYTES = 16;

function deriveKey(password: string, salt: Buffer, { N, r, p, keylen }: ScryptParams) {
  const options: ScryptOptions = { N, r, p, maxmem: 256 * N * r };
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keylen, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<StoredPassword> {
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveKey(password, salt, SCRYPT_PARAMS);
  return { hash: key.toString('base64'), salt: salt.toString('base64'), params: { ...SCRYPT_PARAMS } };
}

/** Re-derives with the stored salt and params and compares in constant time. */
export async function verifyPassword(password: string, stored: StoredPassword) {
  const expected = Buffer.from(stored.hash, 'base64');
  const actual = await deriveKey(password, Buffer.from(stored.salt, 'base64'), stored.params);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Verified against when the email is unknown, so a login for a missing user
 * costs the same scrypt work as one for an existing user.
 */
export const DUMMY_HASH = await hashPassword(randomBytes(32).toString('base64'));

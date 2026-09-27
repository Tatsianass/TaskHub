import { createHash, randomBytes } from 'node:crypto';

/** A new opaque session token: 32 random bytes, base64url (43 chars). */
export function newToken() {
  return randomBytes(32).toString('base64url');
}

/** What the `sessions` table stores instead of the token itself (R2.2). */
export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

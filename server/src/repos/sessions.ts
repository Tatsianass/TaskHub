import type { DatabaseSync } from 'node:sqlite';

import { hashToken, newToken } from '../auth/tokens.js';

/** Sessions expire 30 days after creation, no sliding refresh (R2.3). */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type Session = { tokenHash: string; userId: string; expiresAt: number };

type SessionRow = { token_hash: string; user_id: string; expires_at: number };

export function sessionsRepo(db: DatabaseSync) {
  const insert = db.prepare(
    'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  );
  const selectValid = db.prepare(
    'SELECT token_hash, user_id, expires_at FROM sessions WHERE token_hash = ? AND expires_at > ?',
  );
  const remove = db.prepare('DELETE FROM sessions WHERE token_hash = ?');
  const removeExpired = db.prepare('DELETE FROM sessions WHERE expires_at <= ?');

  return {
    /** Creates a session and returns the raw token; only its hash is stored (R2.2). */
    create(userId: string, now = Date.now()) {
      const token = newToken();
      const expiresAt = now + SESSION_TTL_MS;
      insert.run(hashToken(token), userId, now, expiresAt);
      return { token, expiresAt };
    },

    /** The session for `tokenHash` if it exists and hasn't expired. */
    findValid(tokenHash: string, now = Date.now()): Session | undefined {
      const row = selectValid.get(tokenHash, now) as SessionRow | undefined;
      return row && { tokenHash: row.token_hash, userId: row.user_id, expiresAt: row.expires_at };
    },

    /** Returns true if a session (valid or expired) was deleted. */
    delete(tokenHash: string) {
      return remove.run(tokenHash).changes > 0;
    },

    /** Returns the number of expired sessions removed. */
    deleteExpired(now = Date.now()) {
      return Number(removeExpired.run(now).changes);
    },
  };
}

export type SessionsRepo = ReturnType<typeof sessionsRepo>;

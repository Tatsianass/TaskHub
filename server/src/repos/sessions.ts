import { hashToken, newToken } from '../auth/tokens.js';
import type { Queryable } from '../db/connection.js';

/** Sessions expire 30 days after creation, no sliding refresh (R2.3). */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type Session = { tokenHash: string; userId: string; expiresAt: number };

type SessionRow = { token_hash: string; user_id: string; expires_at: number };

export function sessionsRepo(db: Queryable) {
  return {
    /** Creates a session and returns the raw token; only its hash is stored (R2.2). */
    async create(userId: string, now = Date.now()) {
      const token = newToken();
      const expiresAt = now + SESSION_TTL_MS;
      await db.query(
        'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)',
        [hashToken(token), userId, now, expiresAt],
      );
      return { token, expiresAt };
    },

    /** The session for `tokenHash` if it exists and hasn't expired. */
    async findValid(tokenHash: string, now = Date.now()): Promise<Session | undefined> {
      const { rows } = await db.query<SessionRow>(
        'SELECT token_hash, user_id, expires_at FROM sessions WHERE token_hash = $1 AND expires_at > $2',
        [tokenHash, now],
      );
      const row = rows[0];
      return row && { tokenHash: row.token_hash, userId: row.user_id, expiresAt: row.expires_at };
    },

    /** Returns true if a session (valid or expired) was deleted. */
    async delete(tokenHash: string) {
      const result = await db.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
      return (result.rowCount ?? 0) > 0;
    },

    /** Returns the number of expired sessions removed. */
    async deleteExpired(now = Date.now()) {
      const result = await db.query('DELETE FROM sessions WHERE expires_at <= $1', [now]);
      return result.rowCount ?? 0;
    },
  };
}

export type SessionsRepo = ReturnType<typeof sessionsRepo>;

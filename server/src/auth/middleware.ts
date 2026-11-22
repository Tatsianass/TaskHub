import type { RequestHandler } from 'express';

import { ApiError } from '../errors.js';
import { SESSION_RENEW_AFTER_MS, SESSION_TTL_MS, type SessionsRepo } from '../repos/sessions.js';
import { hashToken } from './tokens.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth. */
      userId?: string;
      /** Hash of the bearer token, set by requireAuth (used by logout). */
      tokenHash?: string;
    }
  }
}

const BEARER = /^Bearer\s+(\S+)$/i;

/**
 * Requires `Authorization: Bearer <token>` with a live session, and renews it once a day of use. Responds 401
 * `SESSION_EXPIRED` for a known but expired token (and deletes it), 401
 * `UNAUTHORIZED` for anything else.
 */
export function requireAuth(sessions: SessionsRepo): RequestHandler {
  return async (req, res, next) => {
    const token = BEARER.exec(req.get('authorization') ?? '')?.[1];
    if (!token) throw new ApiError(401, 'UNAUTHORIZED');

    const tokenHash = hashToken(token);
    const session = await sessions.findValid(tokenHash);
    if (!session) {
      // Only an expired row can still exist here; deleting it tells us which case this is.
      throw new ApiError(401, (await sessions.delete(tokenHash)) ? 'SESSION_EXPIRED' : 'UNAUTHORIZED');
    }

    // Active users stay signed in: a session not renewed for a day gets a fresh 30 days. A failed
    // renewal must not fail the request itself.
    if (session.expiresAt - Date.now() < SESSION_TTL_MS - SESSION_RENEW_AFTER_MS) {
      await sessions.renew(tokenHash).catch(() => {});
    }

    req.userId = session.userId;
    req.tokenHash = tokenHash;
    next();
  };
}

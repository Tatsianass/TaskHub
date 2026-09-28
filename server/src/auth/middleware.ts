import type { RequestHandler } from 'express';

import { ApiError } from '../errors.js';
import type { SessionsRepo } from '../repos/sessions.js';
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
 * Requires `Authorization: Bearer <token>` with a live session. Responds 401
 * `SESSION_EXPIRED` for a known but expired token (and deletes it), 401
 * `UNAUTHORIZED` for anything else.
 */
export function requireAuth(sessions: SessionsRepo): RequestHandler {
  return (req, res, next) => {
    const token = BEARER.exec(req.get('authorization') ?? '')?.[1];
    if (!token) throw new ApiError(401, 'UNAUTHORIZED');

    const tokenHash = hashToken(token);
    const session = sessions.findValid(tokenHash);
    if (!session) {
      // Only an expired row can still exist here; deleting it tells us which case this is.
      throw new ApiError(401, sessions.delete(tokenHash) ? 'SESSION_EXPIRED' : 'UNAUTHORIZED');
    }

    req.userId = session.userId;
    req.tokenHash = tokenHash;
    next();
  };
}

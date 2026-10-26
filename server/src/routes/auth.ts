import { Router, type RequestHandler } from 'express';

import { requireAuth } from '../auth/middleware.js';
import { rateLimit } from '../auth/rate-limit.js';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../auth/password.js';
import { ApiError, SQLITE_CONSTRAINT_UNIQUE, isSqliteError } from '../errors.js';
import type { SessionsRepo } from '../repos/sessions.js';
import type { UsersRepo } from '../repos/users.js';

export const MIN_PASSWORD_LENGTH = 8;
/** Bounds the work scrypt does per request. */
export const MAX_PASSWORD_LENGTH = 128;

export type AuthRateLimits = {
  /** Register + login attempts allowed per client IP within `windowMs`. */
  ipMax: number;
  /** Login attempts allowed per email within `windowMs`. */
  emailMax: number;
  windowMs: number;
};

export const DEFAULT_AUTH_RATE_LIMITS: AuthRateLimits = { ipMax: 30, emailMax: 10, windowMs: 15 * 60 * 1000 };

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/** Reads `{ email, password }`; non-strings count as empty. Email is normalized. */
function readCredentials(body: unknown) {
  const { email, password } = (body ?? {}) as Record<string, unknown>;
  const credentials = {
    email: typeof email === 'string' ? normalizeEmail(email) : '',
    password: typeof password === 'string' ? password : '',
  };
  if (!credentials.email || !credentials.password) {
    throw new ApiError(400, 'ENTER_EMAIL_PASSWORD');
  }
  return credentials;
}

// Request bodies on these routes hold passwords: never log them.
export function authRouter(
  users: UsersRepo,
  sessions: SessionsRepo,
  limits: AuthRateLimits = DEFAULT_AUTH_RATE_LIMITS,
) {
  const router = Router();
  const byIp = rateLimit({ max: limits.ipMax, windowMs: limits.windowMs, key: (req) => req.ip });
  const byEmail = rateLimit({
    max: limits.emailMax,
    windowMs: limits.windowMs,
    key: (req) => {
      const email = (req.body as { email?: unknown } | undefined)?.email;
      return typeof email === 'string' ? normalizeEmail(email) : undefined;
    },
  });

  const register: RequestHandler = async (req, res) => {
    const { email, password } = readCredentials(req.body);
    if (password.length < MIN_PASSWORD_LENGTH) throw new ApiError(400, 'PASSWORD_TOO_SHORT');
    if (password.length > MAX_PASSWORD_LENGTH) throw new ApiError(400, 'PASSWORD_TOO_LONG');

    const stored = await hashPassword(password);
    let user;
    try {
      user = users.create(email, stored);
    } catch (error) {
      if (isSqliteError(error, SQLITE_CONSTRAINT_UNIQUE)) throw new ApiError(409, 'EMAIL_TAKEN');
      throw error;
    }
    const { token } = sessions.create(user.id);
    res.status(201).json({ token, user });
  };

  const login: RequestHandler = async (req, res) => {
    const { email, password } = readCredentials(req.body);
    // No account can have a password this long; skip the scrypt work.
    if (password.length > MAX_PASSWORD_LENGTH) throw new ApiError(401, 'WRONG_PASSWORD');
    const found = users.findByEmail(email);
    // Always run scrypt, so an unknown email takes as long as a wrong password.
    const matches = await verifyPassword(password, found?.password ?? DUMMY_HASH);
    if (!found) throw new ApiError(404, 'USER_NOT_FOUND');
    if (!matches) throw new ApiError(401, 'WRONG_PASSWORD');

    const { token } = sessions.create(found.id);
    res.json({ token, user: { id: found.id, email: found.email } });
  };

  const me: RequestHandler = (req, res) => {
    const user = users.findById(req.userId!);
    if (!user) throw new ApiError(401, 'UNAUTHORIZED');
    res.json({ user });
  };

  const logout: RequestHandler = (req, res) => {
    sessions.delete(req.tokenHash!);
    res.status(204).end();
  };

  const deleteAccount: RequestHandler = (req, res) => {
    users.delete(req.userId!);
    res.status(204).end();
  };

  router.post('/register', byIp, register);
  router.post('/login', byIp, byEmail, login);
  router.get('/me', requireAuth(sessions), me);
  router.post('/logout', requireAuth(sessions), logout);
  router.delete('/account', requireAuth(sessions), deleteAccount);

  return router;
}

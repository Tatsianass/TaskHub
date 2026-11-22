import { randomBytes } from 'node:crypto';

import { Router, type RequestHandler } from 'express';

import { requireAuth } from '../auth/middleware.js';
import type { AppleVerifier } from '../auth/apple.js';
import type { AppleRevoker } from '../auth/apple-revoke.js';
import { failureLimiter, rateLimit } from '../auth/rate-limit.js';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../auth/password.js';
import { ApiError, PG_UNIQUE_VIOLATION, isPgError } from '../errors.js';
import type { SessionsRepo } from '../repos/sessions.js';
import type { UsersRepo } from '../repos/users.js';

export const MIN_PASSWORD_LENGTH = 8;
/** Bounds the work scrypt does per request. */
export const MAX_PASSWORD_LENGTH = 128;

export type AuthRateLimits = {
  /** Register and Apple sign-in requests allowed per client IP within `windowMs`, and failed logins per IP. */
  ipMax: number;
  /** Failed logins allowed per email from one IP within `windowMs` (and failed account deletions per user). */
  emailMax: number;
  windowMs: number;
};

/**
 * Failed logins for one email from all IPs together may reach this many times `emailMax` before the
 * email is blocked for everyone. It stops a spread-out guessing attempt; because one IP's failures
 * alone never block the real owner (`emailMax` is per IP), locking someone out takes many IPs.
 */
export const EMAIL_WIDE_FAILURE_FACTOR = 5;

export const DEFAULT_AUTH_RATE_LIMITS: AuthRateLimits = { ipMax: 30, emailMax: 10, windowMs: 15 * 60 * 1000 };

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/** Longest address allowed by RFC 5321; also keeps the unique index and the limiter's keys small. */
export const MAX_EMAIL_LENGTH = 254;
// Same shape the app checks before it sends anything.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A NUL would make Postgres fail the lookup with a 500. */
function usableEmail(email: string) {
  return email.length <= MAX_EMAIL_LENGTH && !email.includes('\u0000');
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
  if (!usableEmail(credentials.email)) throw new ApiError(400, 'INVALID_EMAIL');
  return credentials;
}

// Request bodies on these routes hold passwords: never log them.
export function authRouter(
  users: UsersRepo,
  sessions: SessionsRepo,
  verifyApple: AppleVerifier,
  limits: AuthRateLimits = DEFAULT_AUTH_RATE_LIMITS,
  revokeApple: AppleRevoker | null = null,
) {
  const router = Router();
  const byIp = rateLimit({ max: limits.ipMax, windowMs: limits.windowMs, key: (req) => req.ip });
  // Logins are limited by their failures only: right passwords never count, so a shared IP (campus,
  // mobile carrier) isn't locked out by its users, and a stranger's wrong guesses from another IP
  // can't lock the real owner out.
  const ipFailures = failureLimiter({ max: limits.ipMax, windowMs: limits.windowMs });
  const pairFailures = failureLimiter({ max: limits.emailMax, windowMs: limits.windowMs });
  const emailFailures = failureLimiter({ max: limits.emailMax * EMAIL_WIDE_FAILURE_FACTOR, windowMs: limits.windowMs });
  const deleteFailures = failureLimiter({ max: limits.emailMax, windowMs: limits.windowMs });

  function blockWhileLimited(res: Parameters<RequestHandler>[1], retryAfter: number) {
    if (retryAfter <= 0) return;
    res.set('Retry-After', String(retryAfter));
    throw new ApiError(429, 'TOO_MANY_REQUESTS');
  }

  const register: RequestHandler = async (req, res) => {
    const { email, password } = readCredentials(req.body);
    // Only new accounts need a well-formed address; older ones may have signed up with anything.
    if (!EMAIL_PATTERN.test(email)) throw new ApiError(400, 'INVALID_EMAIL');
    if (password.length < MIN_PASSWORD_LENGTH) throw new ApiError(400, 'PASSWORD_TOO_SHORT');
    if (password.length > MAX_PASSWORD_LENGTH) throw new ApiError(400, 'PASSWORD_TOO_LONG');

    const stored = await hashPassword(password);
    let user;
    try {
      user = await users.create(email, stored);
    } catch (error) {
      if (isPgError(error, PG_UNIQUE_VIOLATION, 'users_email_key')) throw new ApiError(409, 'EMAIL_TAKEN');
      throw error;
    }
    const { token } = await sessions.create(user.id);
    res.status(201).json({ token, user });
  };

  const login: RequestHandler = async (req, res) => {
    const { email, password } = readCredentials(req.body);
    const ip = String(req.ip);
    const pair = `${ip}|${email}`;
    blockWhileLimited(
      res,
      Math.max(ipFailures.retryAfter(ip), pairFailures.retryAfter(pair), emailFailures.retryAfter(email)),
    );
    // One answer for an unknown email and a wrong password, so the response doesn't reveal which
    // addresses have an account.
    const rejected = () => {
      ipFailures.fail(ip);
      pairFailures.fail(pair);
      emailFailures.fail(email);
      return new ApiError(401, 'INVALID_CREDENTIALS');
    };
    // No account can have a password this long; skip the scrypt work.
    if (password.length > MAX_PASSWORD_LENGTH) throw rejected();
    const found = await users.findByEmail(email);
    // Always run scrypt, so an unknown email takes as long as a wrong password.
    const matches = await verifyPassword(password, found?.password ?? DUMMY_HASH);
    if (!found || !matches) throw rejected();
    pairFailures.clear(pair);

    const { token } = await sessions.create(found.id);
    res.json({ token, user: { id: found.id, email: found.email } });
  };

  /** Largest identity token we will parse; real ones are about 1 KB. */
  const MAX_APPLE_TOKEN_LENGTH = 8192;

  const loginWithApple: RequestHandler = async (req, res) => {
    const { identityToken, nonce } = (req.body ?? {}) as Record<string, unknown>;
    if (
      typeof identityToken !== 'string' ||
      identityToken.length > MAX_APPLE_TOKEN_LENGTH ||
      typeof nonce !== 'string' ||
      nonce === ''
    ) {
      throw new ApiError(400, 'INVALID_APPLE_TOKEN');
    }
    const identity = await verifyApple(identityToken, nonce);

    const existing = await users.findByAppleSub(identity.sub);
    if (existing) {
      const { token } = await sessions.create(existing.id);
      res.json({ token, user: existing });
      return;
    }

    // Never attach Apple to an existing email account: email sign-up is unverified, so anyone could
    // have registered this address first. Use the Apple email only while it is free and verified.
    const email =
      identity.email && identity.emailVerified && !(await users.findByEmail(identity.email))
        ? identity.email
        : `${identity.sub}@apple.invalid`;
    const unusable = await hashPassword(randomBytes(32).toString('hex'));
    let user;
    try {
      user = await users.createApple(identity.sub, email, unusable);
    } catch (error) {
      if (!isPgError(error, PG_UNIQUE_VIOLATION)) throw error;
      // Lost a race with a concurrent request for the same Apple id (or email).
      const winner = await users.findByAppleSub(identity.sub);
      if (!winner) throw new ApiError(409, 'EMAIL_TAKEN');
      user = winner;
    }
    const { token } = await sessions.create(user.id);
    res.status(201).json({ token, user });
  };

  const me: RequestHandler = async (req, res) => {
    const user = await users.findById(req.userId!);
    if (!user) throw new ApiError(401, 'UNAUTHORIZED');
    res.json({ user });
  };

  const logout: RequestHandler = async (req, res) => {
    await sessions.delete(req.tokenHash!);
    res.status(204).end();
  };

  const deleteAccount: RequestHandler = async (req, res) => {
    // An Apple account is only deleted once Apple has let go of it too. Apple wants a fresh
    // authorization code for that, so the app is asked to sign in with Apple once more.
    const userId = req.userId!;
    const appleSub = await users.appleSubOf(userId);
    if (appleSub) {
      if (revokeApple) {
        const code = (req.body as { authorizationCode?: unknown } | undefined)?.authorizationCode;
        if (typeof code !== 'string' || code === '' || code.length > MAX_APPLE_TOKEN_LENGTH) {
          throw new ApiError(400, 'APPLE_REAUTH_REQUIRED');
        }
        await revokeApple(code, appleSub);
      }
    } else {
      // An email account is confirmed with its password, so a stolen session token can't erase it.
      const password = (req.body as { password?: unknown } | undefined)?.password;
      if (typeof password !== 'string' || password === '') throw new ApiError(400, 'PASSWORD_REQUIRED');
      blockWhileLimited(res, deleteFailures.retryAfter(userId));
      const stored = await users.passwordOf(userId);
      const matches = stored && password.length <= MAX_PASSWORD_LENGTH && (await verifyPassword(password, stored));
      if (!matches) {
        deleteFailures.fail(userId);
        throw new ApiError(401, 'WRONG_PASSWORD');
      }
      deleteFailures.clear(userId);
    }
    await users.delete(req.userId!);
    res.status(204).end();
  };

  router.post('/register', byIp, register);
  router.post('/login', login);
  router.post('/apple', byIp, loginWithApple);
  router.get('/me', requireAuth(sessions), me);
  router.post('/logout', requireAuth(sessions), logout);
  router.delete('/account', requireAuth(sessions), deleteAccount);

  return router;
}

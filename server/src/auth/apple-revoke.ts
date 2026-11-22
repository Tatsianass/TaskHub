import { createPrivateKey, sign } from 'node:crypto';

import { ApiError } from '../errors.js';

const APPLE_AUDIENCE = 'https://appleid.apple.com';
const TOKEN_URL = 'https://appleid.apple.com/auth/token';
const REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
const FETCH_TIMEOUT_MS = 8000;
/** The client secret only has to live for the two calls below. */
const SECRET_TTL_S = 5 * 60;

/** The Sign in with Apple key from the developer account, used to prove who we are to Apple. */
export type AppleCredentials = {
  teamId: string;
  keyId: string;
  /** PEM text of the .p8 private key. */
  privateKey: string;
  /** The app's bundle id: the audience the authorization code was issued for. */
  clientId: string;
};

/**
 * Cuts the account's tie to the app on Apple's side (App Store guideline 5.1.1(v)). `code` is the
 * one-time authorization code from a fresh sign-in; `expectedSub` is the Apple id the account
 * belongs to, so someone else's Apple id can never be revoked in its place.
 */
export type AppleRevoker = (code: string, expectedSub: string) => Promise<void>;

export type AppleRevokerOptions = {
  fetchFn?: typeof fetch;
  now?: () => number;
};

const b64url = (value: object | Buffer) =>
  Buffer.from(value instanceof Buffer ? value : JSON.stringify(value)).toString('base64url');

/** The JWT Apple wants as `client_secret`: ES256, signed with the account's private key. */
export function appleClientSecret(credentials: AppleCredentials, nowMs: number): string {
  const issuedAt = Math.floor(nowMs / 1000);
  const head = b64url({ alg: 'ES256', kid: credentials.keyId });
  const body = b64url({
    iss: credentials.teamId,
    iat: issuedAt,
    exp: issuedAt + SECRET_TTL_S,
    aud: APPLE_AUDIENCE,
    sub: credentials.clientId,
  });
  const signature = sign('sha256', Buffer.from(`${head}.${body}`), {
    key: createPrivateKey(credentials.privateKey),
    dsaEncoding: 'ieee-p1363',
  });
  return `${head}.${body}.${b64url(signature)}`;
}

function subOf(idToken: unknown): string | null {
  if (typeof idToken !== 'string') return null;
  try {
    // Straight from Apple over TLS, so it needs no signature check; only the subject is read.
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8'));
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

export function createAppleRevoker(
  credentials: AppleCredentials,
  { fetchFn = fetch, now = Date.now }: AppleRevokerOptions = {},
): AppleRevoker {
  async function post(url: string, params: Record<string, string>) {
    let res: Response;
    try {
      res = await fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      throw new ApiError(502, 'APPLE_UNAVAILABLE');
    }
    // A rejected code (used, expired, wrong app) is the client's problem; anything else is Apple's.
    if (res.status === 400 || res.status === 401) throw new ApiError(401, 'INVALID_APPLE_TOKEN');
    if (!res.ok) throw new ApiError(502, 'APPLE_UNAVAILABLE');
    return res;
  }

  return async (code, expectedSub) => {
    const base = { client_id: credentials.clientId, client_secret: appleClientSecret(credentials, now()) };
    const exchanged = (await (await post(TOKEN_URL, { ...base, code, grant_type: 'authorization_code' })).json()) as {
      refresh_token?: unknown;
      id_token?: unknown;
    };
    if (subOf(exchanged.id_token) !== expectedSub || typeof exchanged.refresh_token !== 'string') {
      throw new ApiError(403, 'APPLE_ACCOUNT_MISMATCH');
    }
    await post(REVOKE_URL, { ...base, token: exchanged.refresh_token, token_type_hint: 'refresh_token' });
  };
}

/** `APPLE_PRIVATE_KEY` often arrives with literal `\n` in a one-line secret. */
export function normalizePrivateKey(value: string) {
  return value.replace(/\\n/g, '\n').trim();
}

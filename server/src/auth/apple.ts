import { createHash, createPublicKey, verify, type JsonWebKey } from 'node:crypto';

import { ApiError } from '../errors.js';

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';
const KEYS_TTL_MS = 60 * 60 * 1000;
/** A token with an unknown `kid` may mean Apple rotated keys; refetch at most this often. */
const KEYS_REFETCH_MIN_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;

export type AppleJwk = JsonWebKey & { kid: string };

export type AppleIdentity = {
  /** Apple's stable user id, the same on every sign-in. */
  sub: string;
  /** May be an Apple private-relay address, or missing. */
  email: string | null;
  emailVerified: boolean;
};

export type AppleVerifier = (identityToken: string, rawNonce: string) => Promise<AppleIdentity>;

export type AppleVerifierOptions = {
  /** Accepted `aud` values: the app's bundle id (and Expo Go's, while testing). */
  audiences: string[];
  fetchKeys?: () => Promise<AppleJwk[]>;
  now?: () => number;
};

async function fetchAppleKeys(): Promise<AppleJwk[]> {
  const res = await fetch(APPLE_KEYS_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Apple keys: HTTP ${res.status}`);
  const { keys } = (await res.json()) as { keys: AppleJwk[] };
  return keys;
}

function decodePart(part: string): Record<string, unknown> {
  const value = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('bad JWT part');
  return value;
}

/**
 * Checks a Sign in with Apple identity token: RS256 signature against Apple's published keys, issuer,
 * audience, expiry, and that its nonce is the SHA-256 of the raw nonce the client generated.
 * Anything wrong with the token is a 401 INVALID_APPLE_TOKEN; Apple's key server being down is a 503.
 */
export function createAppleVerifier({ audiences, fetchKeys = fetchAppleKeys, now = Date.now }: AppleVerifierOptions): AppleVerifier {
  let keys: AppleJwk[] = [];
  let fetchedAt = -Infinity;

  async function keyFor(kid: string) {
    const known = () => keys.find((key) => key.kid === kid);
    const age = now() - fetchedAt;
    if (known() && age < KEYS_TTL_MS) return known();
    if (age >= KEYS_REFETCH_MIN_MS) {
      try {
        keys = await fetchKeys();
        fetchedAt = now();
      } catch {
        if (!known()) throw new ApiError(503, 'APPLE_UNAVAILABLE');
      }
    }
    return known();
  }

  return async (identityToken, rawNonce) => {
    const invalid = () => new ApiError(401, 'INVALID_APPLE_TOKEN');
    const parts = identityToken.split('.');
    if (parts.length !== 3) throw invalid();
    const [headerPart, payloadPart, signaturePart] = parts;

    let header: Record<string, unknown>;
    let payload: Record<string, unknown>;
    try {
      header = decodePart(headerPart);
      payload = decodePart(payloadPart);
    } catch {
      throw invalid();
    }
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw invalid();

    const jwk = await keyFor(header.kid);
    if (!jwk) throw invalid();
    let signatureOk = false;
    try {
      signatureOk = verify(
        'RSA-SHA256',
        Buffer.from(`${headerPart}.${payloadPart}`),
        createPublicKey({ key: jwk, format: 'jwk' }),
        Buffer.from(signaturePart, 'base64url'),
      );
    } catch {
      // A malformed key or signature is just an invalid token.
    }
    if (!signatureOk) throw invalid();

    const { iss, aud, exp, sub, nonce, email } = payload;
    if (iss !== APPLE_ISSUER) throw invalid();
    if (typeof aud !== 'string' || !audiences.includes(aud)) throw invalid();
    if (typeof exp !== 'number' || exp * 1000 <= now()) throw invalid();
    if (typeof sub !== 'string' || sub === '') throw invalid();
    if (nonce !== createHash('sha256').update(rawNonce).digest('hex')) throw invalid();

    return {
      sub,
      email: typeof email === 'string' && email !== '' ? email.trim().toLowerCase() : null,
      // Apple sends this as a boolean or as the string "true".
      emailVerified: payload.email_verified === true || payload.email_verified === 'true',
    };
  };
}

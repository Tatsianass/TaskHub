// Must be referenced literally as process.env.EXPO_PUBLIC_* so Expo inlines it.
const rawBaseUrl = process.env.EXPO_PUBLIC_API_URL;

if (!rawBaseUrl) {
  throw new Error('Missing EXPO_PUBLIC_API_URL in your .env file (see .env.example)');
}

const BASE_URL = rawBaseUrl.replace(/\/+$/, '');
const TIMEOUT_MS = 10_000;
const SESSION_ERRORS = new Set(['UNAUTHORIZED', 'SESSION_EXPIRED']);

// `message` is the error code so screens can keep calling t(`errors.${code}`).
export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function setOnUnauthorized(cb: (() => void) | null) {
  onUnauthorized = cb;
}

type RequestOptions = { method?: string; body?: unknown };

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const sentToken = authToken;
  if (sentToken) headers.Authorization = `Bearer ${sentToken}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
    });
  } catch {
    // Network failure, DNS, refused connection or timeout abort.
    throw new ApiError('SERVER_UNREACHABLE', 0);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 204) return undefined as T;

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // Empty or non-JSON body (e.g. a proxy error page).
  }

  if (!res.ok) {
    const code =
      data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
        ? (data as { error: string }).error
        : 'UNKNOWN';
    // Only a rejected session token logs the user out; a 401 WRONG_PASSWORD
    // from /auth/login must not.
    if (res.status === 401 && sentToken && SESSION_ERRORS.has(code)) onUnauthorized?.();
    throw new ApiError(code, res.status);
  }

  return data as T;
}

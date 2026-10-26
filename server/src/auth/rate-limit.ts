import type { RequestHandler } from 'express';

import { ApiError } from '../errors.js';

export type RateLimitOptions = {
  /** Requests allowed per key within `windowMs`. */
  max: number;
  windowMs: number;
  /** Bucket for a request, or `undefined` to let it through uncounted. */
  key: (req: Parameters<RequestHandler>[0]) => string | undefined;
  now?: () => number;
};

/**
 * Fixed-window, in-memory limiter. State is per process, which is enough while
 * the API runs as a single Machine (see fly.toml). Over the limit: 429
 * `TOO_MANY_REQUESTS` with `Retry-After`.
 */
export function rateLimit({ max, windowMs, key, now = Date.now }: RateLimitOptions): RequestHandler {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return (req, res, next) => {
    const id = key(req);
    if (id === undefined) return next();

    const time = now();
    if (buckets.size > 10_000) {
      for (const [k, bucket] of buckets) if (bucket.resetAt <= time) buckets.delete(k);
    }
    let bucket = buckets.get(id);
    if (!bucket || bucket.resetAt <= time) {
      bucket = { count: 0, resetAt: time + windowMs };
      buckets.set(id, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      res.set('Retry-After', String(Math.ceil((bucket.resetAt - time) / 1000)));
      throw new ApiError(429, 'TOO_MANY_REQUESTS');
    }
    next();
  };
}

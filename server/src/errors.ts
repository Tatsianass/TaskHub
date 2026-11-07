import type { ErrorRequestHandler, RequestHandler } from 'express';

/** An expected error, sent to the client as `{ error: code }` with `status`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

/** Postgres SQLSTATE codes; the driver puts them on `error.code`. */
export const PG_UNIQUE_VIOLATION = '23505';
export const PG_CHECK_VIOLATION = '23514';

/**
 * Match Postgres errors by SQLSTATE (and optionally constraint name), never by message. Primary
 * keys and unique indexes share 23505, so callers that must tell them apart pass `constraint`.
 */
export function isPgError(error: unknown, code: string, constraint?: string) {
  const e = error as { code?: unknown; constraint?: unknown } | null;
  return e?.code === code && (constraint === undefined || e.constraint === constraint);
}

/** Errors raised by express.json() (body-parser) carry a `type`. */
type BodyParserError = Error & { type?: string; status?: number };

function toApiError(error: unknown): ApiError | null {
  if (error instanceof ApiError) return error;
  const { type } = error as BodyParserError;
  if (type === 'entity.too.large') return new ApiError(413, 'PAYLOAD_TOO_LARGE');
  if (type === 'entity.parse.failed') return new ApiError(400, 'INVALID_JSON');
  return null;
}

export const notFoundHandler: RequestHandler = () => {
  throw new ApiError(404, 'NOT_FOUND');
};

export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  const apiError = toApiError(error);
  if (apiError) {
    res.status(apiError.status).json({ error: apiError.code });
    return;
  }
  // Log the stack only — never the request body (it may hold a password).
  console.error(`[error] ${req.method} ${req.path}`, error instanceof Error ? error.stack : error);
  res.status(500).json({ error: 'INTERNAL' });
};

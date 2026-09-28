import { createHash } from 'node:crypto';

/**
 * The id an imported row gets when its client id already belongs to another
 * user: a UUID-shaped SHA-256 of (user, original id). Deterministic, so
 * importing the same payload again hits the same id and is skipped (R6.2).
 */
export function remappedId(userId: string, id: string) {
  const hex = createHash('sha256').update(`${userId}\0${id}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Inserts a row for an import, keeping the client id when possible.
 * `insert(id)` must be an `INSERT … ON CONFLICT(id) DO NOTHING` returning
 * whether a row was written. Returns true if a row was inserted, false if
 * this user already had it.
 */
export function importRow(
  userId: string,
  id: string,
  insert: (id: string) => boolean,
  ownerOf: (id: string) => string | undefined,
) {
  if (insert(id)) return true;
  if (ownerOf(id) === userId) return false; // same user: duplicate, skip
  return insert(remappedId(userId, id)); // false if imported under this id before
}

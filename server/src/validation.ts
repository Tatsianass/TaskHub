import { ApiError } from './errors.js';

// Copies of the app's enums (src/types/task.ts, src/constants/*). The server
// must not import app code; keep these in sync with the CHECKs in migrations.ts.
export const QUADRANT_IDS = [
  'urgent-important',
  'not-urgent-important',
  'urgent-not-important',
  'not-urgent-not-important',
] as const;
export const TAG_IDS = ['work', 'home'] as const;

export type QuadrantId = (typeof QUADRANT_IDS)[number];
export type TagId = (typeof TAG_IDS)[number];

/** Same shape as the app's `Task` (src/types/task.ts). */
export type Task = {
  id: string;
  title: string;
  description: string;
  quadrantId: QuadrantId;
  tag: TagId | null;
  done: boolean;
  /** When the task was marked done (ms since epoch); `null` while open or for tasks done before this existed. */
  completedAt: number | null;
  createdAt: number;
  dueDate: string | null;
  remindMe: boolean;
  remindTime: string | null;
};

/** The fields `PUT /tasks/:id` may change: everything except `id` and `createdAt`. */
export type TaskUpdate = Omit<Task, 'id' | 'createdAt'>;

/** Same shape as the app's `Birthday` (src/types/birthday.ts). */
export type Birthday = {
  id: string;
  name: string;
  date: string;
  remindMe: boolean;
  remindTime: string | null;
  /** Days before the birthday to send a heads-up alert, or `null` for none. */
  alertDaysBefore: number | null;
};

export const MAX_ID_LENGTH = 128;

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^(\d{2}):(\d{2})$/;

type Fields = Record<string, unknown>;

/** A validator returns the cleaned value, or `undefined` if the input is invalid. */
type Check<T> = (value: unknown) => T | undefined;

const id: Check<string> = (value) =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH ? value : undefined;

const nonEmptyTrimmed: Check<string> = (value) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const text: Check<string> = (value) => (typeof value === 'string' ? value.trim() : undefined);

const bool: Check<boolean> = (value) => (typeof value === 'boolean' ? value : undefined);

const finiteNumber: Check<number> = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

function oneOf<T extends string>(values: readonly T[]): Check<T> {
  return (value) => (values.includes(value as T) ? (value as T) : undefined);
}

/** `YYYY-MM-DD` that is a real calendar date (no 2025-02-30). */
const date: Check<string> = (value) => {
  if (typeof value !== 'string') return undefined;
  const match = DATE.exec(value);
  if (!match) return undefined;
  const [year, month, day] = match.slice(1).map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  const real =
    parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
  return real ? value : undefined;
};

/** 24-hour `HH:mm`. */
const time: Check<string> = (value) => {
  if (typeof value !== 'string') return undefined;
  const match = TIME.exec(value);
  if (!match) return undefined;
  const [hours, minutes] = match.slice(1).map(Number);
  return hours < 24 && minutes < 60 ? value : undefined;
};

/** Accepts `null` as well as whatever `check` accepts. */
function nullable<T>(check: Check<T>): Check<T | null> {
  return (value) => (value === null ? null : check(value));
}

/**
 * Validates each field of `body` with its check and returns the cleaned
 * object; unknown fields are dropped. Throws `ApiError(400, code)` if the body
 * isn't an object or any field is missing/invalid.
 */
function parseObject<T>(body: unknown, checks: { [K in keyof T]: Check<T[K]> }, code: string): T {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new ApiError(400, code);
  const fields = body as Fields;
  const result = {} as T;
  for (const key of Object.keys(checks) as (keyof T & string)[]) {
    const value = checks[key](fields[key]);
    if (value === undefined) throw new ApiError(400, code);
    result[key] = value;
  }
  return result;
}

/** Like `nullable(finiteNumber)`, but a missing field (older clients) reads as `null`. */
const optionalNullableNumber: Check<number | null> = (value) =>
  value === undefined || value === null ? null : finiteNumber(value);

const taskUpdateChecks: { [K in keyof TaskUpdate]: Check<TaskUpdate[K]> } = {
  title: nonEmptyTrimmed,
  description: text,
  quadrantId: oneOf(QUADRANT_IDS),
  tag: nullable(oneOf(TAG_IDS)),
  done: bool,
  completedAt: optionalNullableNumber,
  dueDate: nullable(date),
  remindMe: bool,
  remindTime: nullable(time),
};

/** A full `Task` (POST /tasks, /import). Throws 400 `INVALID_TASK`. */
export function parseTask(body: unknown): Task {
  return parseObject<Task>(
    body,
    { id, createdAt: finiteNumber, ...taskUpdateChecks },
    'INVALID_TASK',
  );
}

/**
 * The body of `PUT /tasks/:id`. `id` and `createdAt` are ignored if present
 * (the client sends the whole task). Throws 400 `INVALID_TASK`.
 */
export function parseTaskUpdate(body: unknown): TaskUpdate {
  return parseObject<TaskUpdate>(body, taskUpdateChecks, 'INVALID_TASK');
}

/** A missing field (older clients) reads as the old behaviour: remind at 09:00. */
const optionalRemindMe: Check<boolean> = (value) => (value === undefined ? true : bool(value));
const optionalRemindTime: Check<string | null> = (value) => (value === undefined ? '09:00' : nullable(time)(value));

/** 1-60 whole days, or `null`; a missing field (older clients) reads as `null`. */
const optionalAlertDays: Check<number | null> = (value) => {
  if (value === undefined || value === null) return null;
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 60 ? value : undefined;
};

/** A full `Birthday` (POST /birthdays, /import). Throws 400 `INVALID_BIRTHDAY`. */
export function parseBirthday(body: unknown): Birthday {
  return parseObject<Birthday>(
    body,
    { id, name: nonEmptyTrimmed, date, remindMe: optionalRemindMe, remindTime: optionalRemindTime, alertDaysBefore: optionalAlertDays },
    'INVALID_BIRTHDAY',
  );
}

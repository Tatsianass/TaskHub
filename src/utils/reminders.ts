import type { Task } from '@/types/task';

type Translate = (key: string, params?: Record<string, string | number>) => string;

export const MAX_REMINDERS = 5;
export const MAX_OFFSET_MINUTES = 30 * 24 * 60;
export const DEFAULT_REMIND_TIME = '09:00';
/** One-tap alerts for a task with a time, in minutes before it; 0 is the task time itself. */
export const TIMED_PRESETS = [0, 5, 15, 30, 60, 1440] as const;
/** One-tap alerts for an all-day task, counted back from the default reminder time; 0 is the day itself. */
export const ALL_DAY_PRESETS = [0, 1440, 2880, 10080] as const;
export const PRESET_OFFSETS: readonly number[] = [...new Set([...TIMED_PRESETS, ...ALL_DAY_PRESETS])];

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

/**
 * Keeps whole, in-range, distinct minute counts (at most MAX_REMINDERS). Anything that isn't an
 * array - data written before alerts existed - reads as `fallback`.
 */
export function sanitizeOffsets(value: unknown, fallback: number[] = []): number[] {
  if (!Array.isArray(value)) return fallback;
  const valid = value.filter(
    (item): item is number => Number.isInteger(item) && item >= 0 && item <= MAX_OFFSET_MINUTES,
  );
  return [...new Set(valid)].slice(0, MAX_REMINDERS);
}

/** The task's alerts; a task saved before alerts existed has one at its reminder time if `remindMe`. */
export function taskOffsets(task: Pick<Task, 'remindMe' | 'remindOffsets'>): number[] {
  return sanitizeOffsets(task.remindOffsets, task.remindMe ? [0] : []);
}

/** "At task time", "1 hour before", "2 days before"... in the largest unit that divides evenly. */
export function offsetLabel(t: Translate, minutes: number): string {
  if (minutes === 0) return t('reminders.atTime');
  if (minutes % MINUTES_PER_WEEK === 0) return t('reminders.before.week', { count: minutes / MINUTES_PER_WEEK });
  if (minutes % MINUTES_PER_DAY === 0) return t('reminders.before.day', { count: minutes / MINUTES_PER_DAY });
  if (minutes % MINUTES_PER_HOUR === 0) return t('reminders.before.hour', { count: minutes / MINUTES_PER_HOUR });
  return t('reminders.before.minute', { count: minutes });
}

/** The moment alerts count back from: the task's own time, or the default reminder time for an all-day task. */
export function anchorTime(task: Pick<Task, 'remindTime'>, defaultTime: string): string {
  return task.remindTime ?? defaultTime;
}

/** When an alert `offset` minutes before `time` on `dueDate` (YYYY-MM-DD, HH:mm) goes off. */
export function reminderDate(dueDate: string, time: string, offset: number): Date {
  const [year, month, day] = dueDate.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes - offset);
}

export type AlertOutlook =
  | { kind: 'none' }
  | { kind: 'needDate' }
  | { kind: 'passed' }
  | { kind: 'next'; date: Date };

/** What will happen with these alerts: nothing set, no date to count from, all in the past, or the next one. */
export function alertOutlook(dueDate: string | null, anchor: string, offsets: number[], nowMs = Date.now()): AlertOutlook {
  if (offsets.length === 0) return { kind: 'none' };
  if (!dueDate) return { kind: 'needDate' };
  const upcoming = offsets
    .map((offset) => reminderDate(dueDate, anchor, offset))
    .filter((date) => date.getTime() > nowMs)
    .sort((a, b) => a.getTime() - b.getTime());
  return upcoming.length ? { kind: 'next', date: upcoming[0] } : { kind: 'passed' };
}

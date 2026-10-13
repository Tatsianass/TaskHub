import type { Task } from '@/types/task';

type Translate = (key: string, params?: Record<string, string | number>) => string;

export const MAX_REMINDERS = 5;
export const MAX_OFFSET_MINUTES = 30 * 24 * 60;
export const DEFAULT_REMIND_TIME = '09:00';
/** Offered in the picker, in minutes before the task's reminder time; 0 is the reminder itself. */
export const PRESET_OFFSETS = [0, 5, 15, 30, 60, 120, 1440, 2880, 10080] as const;

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

/** When an alert `offset` minutes before `time` on `dueDate` (YYYY-MM-DD, HH:mm) goes off. */
export function reminderDate(dueDate: string, time: string, offset: number): Date {
  const [year, month, day] = dueDate.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes - offset);
}

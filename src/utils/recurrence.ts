import { addDaysISO, isoDateOf, todayISODate } from '@/utils/dates';
import { computeQuadrant, isImportantQuadrant, isUrgentDate } from '@/utils/priority';
import type { RepeatRule, Task } from '@/types/task';

export const REPEAT_RULES: readonly RepeatRule[] = ['daily', 'weekdays', 'weekly', 'monthly', 'yearly'];

function parts(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return { year, month, day };
}

/** `day` of `month` (0-based, may overflow into other years), clamped to the month's length (31 -> 28/29 Feb). */
function clampedDate(year: number, month: number, day: number): string {
  const target = new Date(year, month, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return isoDateOf(target.getTime());
}

/**
 * The `step`-th occurrence of a rule counted from `dueDate` (step >= 0). Monthly and yearly ones take
 * their day (and, yearly, month) from `anchor`, so a task that was pushed to the 28th by a short month
 * goes back to the 31st instead of staying on the 28th for good.
 */
function nthOccurrence(rule: Exclude<RepeatRule, 'weekdays'>, dueDate: string, anchor: string, step: number): string {
  const due = parts(dueDate);
  const base = parts(anchor);
  switch (rule) {
    case 'daily':
      return addDaysISO(dueDate, step);
    case 'weekly':
      return addDaysISO(dueDate, 7 * step);
    case 'monthly':
      return clampedDate(due.year, due.month - 1 + step, base.day);
    case 'yearly':
      return clampedDate(due.year + step, base.month - 1, base.day);
  }
}

/** Saturday and Sunday are skipped by the `weekdays` rule. */
function isWeekend(dateStr: string): boolean {
  const { year, month, day } = parts(dateStr);
  const weekday = new Date(year, month - 1, day).getDay();
  return weekday === 0 || weekday === 6;
}

/**
 * The due date of the next occurrence of a task due on `dueDate`: the first one after it that is
 * also after `today`. Finishing early moves it one period on from the due date; finishing a
 * month-old rent task doesn't leave the next one already overdue. Each step is counted from
 * `dueDate`, not from the previous step, so "31st monthly" doesn't get stuck on the 28th while
 * catching up, and `anchor` (the series' original date, default `dueDate`) keeps it from getting
 * stuck there across completions.
 */
export function nextDueDate(
  rule: RepeatRule,
  dueDate: string,
  today: string = todayISODate(),
  anchor: string = dueDate,
): string {
  if (rule === 'weekdays') {
    let next = addDaysISO(dueDate > today ? dueDate : today, 1);
    while (isWeekend(next)) next = addDaysISO(next, 1);
    return next;
  }
  // Monthly and yearly occurrences may fall on or before `dueDate` for step 0 (the anchor's day can
  // be earlier or later in the month than where the task was moved), so they start there.
  let step = rule === 'monthly' || rule === 'yearly' ? 0 : 1;
  let next = nthOccurrence(rule, dueDate, anchor, step);
  while (next <= dueDate || next <= today) next = nthOccurrence(rule, dueDate, anchor, ++step);
  return next;
}

/**
 * Puts a repeating task into a series: it gets a `seriesId` (from `newSeriesId`) and the date it
 * started from, unless it already has them. Tasks that don't repeat come back without a series.
 */
export function withSeries(task: Task, newSeriesId: () => string): Task {
  if (!task.repeat || !task.dueDate) return { ...task, seriesId: null, repeatAnchor: null };
  return { ...task, seriesId: task.seriesId ?? newSeriesId(), repeatAnchor: task.repeatAnchor ?? task.dueDate };
}

/**
 * The follow-up to a repeating task that was just completed, or null if it doesn't repeat (or has
 * no date to repeat from). It keeps the title, notes, tag, reminders and importance; its urgency
 * follows the new date.
 */
export function nextOccurrence(task: Task, id: string, now: number, today: string = todayISODate()): Task | null {
  if (!task.repeat || !task.dueDate) return null;
  const dueDate = nextDueDate(task.repeat, task.dueDate, today, task.repeatAnchor ?? task.dueDate);
  return {
    ...task,
    id,
    quadrantId: computeQuadrant(isImportantQuadrant(task.quadrantId), isUrgentDate(dueDate, today)),
    dueDate,
    done: false,
    completedAt: null,
    createdAt: now,
  };
}

/**
 * Whether `candidate` is already the open follow-up of `completed` (so completing it twice doesn't
 * double up). Tasks of a series are matched by it; only tasks saved before series existed fall back
 * to the same title and rule, which can mistake two look-alike tasks for each other.
 */
export function isFollowUp(completed: Task, candidate: Task): boolean {
  const sameSeries = completed.seriesId
    ? candidate.seriesId === completed.seriesId
    : !candidate.seriesId && candidate.title === completed.title && candidate.repeat === completed.repeat;
  return (
    !candidate.done &&
    candidate.id !== completed.id &&
    sameSeries &&
    !!candidate.dueDate &&
    !!completed.dueDate &&
    candidate.dueDate > completed.dueDate
  );
}

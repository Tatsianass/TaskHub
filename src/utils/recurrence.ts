import { addDaysISO, isoDateOf, todayISODate } from '@/utils/dates';
import { computeQuadrant, isImportantQuadrant, isUrgentDate } from '@/utils/priority';
import type { RepeatRule, Task } from '@/types/task';

export const REPEAT_RULES: readonly RepeatRule[] = ['daily', 'weekdays', 'weekly', 'monthly', 'yearly'];

function parts(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return { year, month, day };
}

/** Year/month shifted by `months`, with the day clamped to the target month's length (31 Jan + 1 month = 28/29 Feb). */
function addMonthsISO(dateStr: string, months: number): string {
  const { year, month, day } = parts(dateStr);
  const target = new Date(year, month - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return isoDateOf(target.getTime());
}

/** The `step`-th occurrence after `dueDate` (step >= 1) for rules that repeat at a fixed interval. */
function nthOccurrence(rule: Exclude<RepeatRule, 'weekdays'>, dueDate: string, step: number): string {
  switch (rule) {
    case 'daily':
      return addDaysISO(dueDate, step);
    case 'weekly':
      return addDaysISO(dueDate, 7 * step);
    case 'monthly':
      return addMonthsISO(dueDate, step);
    case 'yearly':
      return addMonthsISO(dueDate, 12 * step);
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
 * `dueDate`, not from the previous step, so "31st monthly" doesn't get stuck on the 28th.
 */
export function nextDueDate(rule: RepeatRule, dueDate: string, today: string = todayISODate()): string {
  if (rule === 'weekdays') {
    let next = addDaysISO(dueDate > today ? dueDate : today, 1);
    while (isWeekend(next)) next = addDaysISO(next, 1);
    return next;
  }
  let step = 1;
  let next = nthOccurrence(rule, dueDate, step);
  while (next <= today) next = nthOccurrence(rule, dueDate, ++step);
  return next;
}

/**
 * The follow-up to a repeating task that was just completed, or null if it doesn't repeat (or has
 * no date to repeat from). It keeps the title, notes, tag, reminders and importance; its urgency
 * follows the new date.
 */
export function nextOccurrence(task: Task, id: string, now: number, today: string = todayISODate()): Task | null {
  if (!task.repeat || !task.dueDate) return null;
  const dueDate = nextDueDate(task.repeat, task.dueDate, today);
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

/** Whether `candidate` is already the open follow-up of `completed` (so completing it twice doesn't double up). */
export function isFollowUp(completed: Task, candidate: Task): boolean {
  return (
    !candidate.done &&
    candidate.id !== completed.id &&
    candidate.title === completed.title &&
    candidate.repeat === completed.repeat &&
    !!candidate.dueDate &&
    !!completed.dueDate &&
    candidate.dueDate > completed.dueDate
  );
}

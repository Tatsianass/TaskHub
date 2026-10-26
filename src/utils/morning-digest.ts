import type { Task } from '@/types/task';
import { dayDiffFromToday } from '@/utils/dates';
import { overdueTasks } from '@/utils/overdue';
import { urgentCounterpart } from '@/utils/priority';
import { taskOffsets } from '@/utils/reminders';

/** Why a task is in the morning digest, most pressing first. */
export type DigestKind = 'escalated' | 'overdue' | 'today' | 'tomorrow';
export const DIGEST_KINDS: DigestKind[] = ['escalated', 'overdue', 'today', 'tomorrow'];

export type DigestItem = { task: Task; kind: DigestKind };

export type DigestOptions = {
  /** Deadline-priority window (days), or null when the boost is off. */
  escalationDays: number | null;
  /** Announce tasks that moved to urgent today, and tasks due today or tomorrow. */
  soon: boolean;
  /** Include tasks that are already overdue. */
  overdue: boolean;
};

/**
 * What belongs in the single morning notification of `day` (YYYY-MM-DD). A task appears at most
 * once: a move to urgent is announced only on the day it happens, and a task that has its own
 * reminder alerts isn't repeated as "due soon" because the user already chose to be pinged for it.
 */
export function morningDigest(tasks: Task[], day: string, options: DigestOptions): DigestItem[] {
  const items: DigestItem[] = [];
  const used = new Set<string>();
  const add = (task: Task, kind: DigestKind) => {
    if (used.has(task.id)) return;
    used.add(task.id);
    items.push({ task, kind });
  };
  const open = tasks.filter((task) => !task.done && task.dueDate !== null);

  if (options.soon && options.escalationDays !== null) {
    for (const task of open) {
      if (urgentCounterpart(task.quadrantId) && dayDiffFromToday(task.dueDate!, day) === options.escalationDays) {
        add(task, 'escalated');
      }
    }
  }
  if (options.overdue) for (const task of overdueTasks(tasks, day)) add(task, 'overdue');
  if (options.soon) {
    for (const task of open) {
      if (taskOffsets(task).length > 0) continue;
      const diff = dayDiffFromToday(task.dueDate!, day);
      if (diff === 0) add(task, 'today');
      else if (diff === 1) add(task, 'tomorrow');
    }
  }
  return items;
}

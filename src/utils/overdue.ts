import { dayDiffFromToday } from '@/utils/dates';
import type { Task } from '@/types/task';

/** Open tasks whose due date is before `today` (YYYY-MM-DD), the longest overdue first. */
export function overdueTasks(tasks: Task[], today: string): Task[] {
  return tasks
    .filter((task) => !task.done && task.dueDate !== null && task.dueDate < today)
    .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : a.dueDate! > b.dueDate! ? 1 : a.createdAt - b.createdAt));
}

/** How many whole days `task` has been overdue on `today`; 0 for a task that isn't. */
export function daysOverdue(task: Pick<Task, 'dueDate'>, today: string): number {
  return task.dueDate ? Math.max(0, -dayDiffFromToday(task.dueDate, today)) : 0;
}

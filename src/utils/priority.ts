import { dayDiffFromToday } from '@/utils/dates';
import type { QuadrantId, Task } from '@/types/task';

const URGENT_COUNTERPART: Partial<Record<QuadrantId, QuadrantId>> = {
  'not-urgent-important': 'urgent-important',
  'not-urgent-not-important': 'urgent-not-important',
};

/**
 * The quadrant a task should be grouped/displayed under on `today` (YYYY-MM-DD). Never mutates
 * the task's stored `quadrantId` — an approaching deadline only escalates a "not urgent" task to
 * its "urgent" counterpart for as long as the deadline stays inside the configured window, so
 * the effect self-reverts if the due date moves back out or the task is edited.
 *
 * Completed tasks stay where they were escalated to, so ticking one off doesn't make it jump
 * to another quadrant.
 */
export function effectiveQuadrantId(task: Task, escalationDays: number | null, today: string): QuadrantId {
  if (escalationDays === null || !task.dueDate) return task.quadrantId;
  const counterpart = URGENT_COUNTERPART[task.quadrantId];
  if (!counterpart) return task.quadrantId;
  return dayDiffFromToday(task.dueDate, today) <= escalationDays ? counterpart : task.quadrantId;
}

/** Whether an open task is currently boosted by the deadline-escalation setting (drives the 🔥 and the banner). */
export function isEscalated(task: Task, escalationDays: number | null, today: string): boolean {
  return !task.done && effectiveQuadrantId(task, escalationDays, today) !== task.quadrantId;
}

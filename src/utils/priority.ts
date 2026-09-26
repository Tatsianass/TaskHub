import { dayDiffFromToday } from '@/utils/dates';
import type { QuadrantId, Task } from '@/types/task';

const URGENT_COUNTERPART: Partial<Record<QuadrantId, QuadrantId>> = {
  'not-urgent-important': 'urgent-important',
  'not-urgent-not-important': 'urgent-not-important',
};

/**
 * The quadrant a task should be grouped/displayed under right now. Never mutates the task's
 * stored `quadrantId` — an approaching deadline only escalates a "not urgent" task to its
 * "urgent" counterpart for as long as the deadline stays inside the configured window, so the
 * effect self-reverts if the due date moves back out or the task is edited.
 */
export function effectiveQuadrantId(task: Task, escalationDays: number | null): QuadrantId {
  if (escalationDays === null || task.done || !task.dueDate) return task.quadrantId;
  const counterpart = URGENT_COUNTERPART[task.quadrantId];
  if (!counterpart) return task.quadrantId;
  return dayDiffFromToday(task.dueDate) <= escalationDays ? counterpart : task.quadrantId;
}

/** Whether a task's displayed quadrant is currently boosted by the deadline-escalation setting. */
export function isEscalated(task: Task, escalationDays: number | null): boolean {
  return effectiveQuadrantId(task, escalationDays) !== task.quadrantId;
}

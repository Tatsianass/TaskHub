import type { Task } from '@/types/task';

/** What `PATCH /tasks/:id` may change: everything except `id` and `createdAt`. */
export type TaskPatch = Partial<Omit<Task, 'id' | 'createdAt'>>;

const FIELDS: (keyof TaskPatch)[] = [
  'title',
  'description',
  'quadrantId',
  'tag',
  'done',
  'completedAt',
  'dueDate',
  'remindMe',
  'remindTime',
  'remindOffsets',
  'repeat',
  'seriesId',
  'repeatAnchor',
];

/**
 * `current` with the fields of `patch` put back to what `before` had, so a change the server turned
 * down is undone without touching anything else about the task. A field that has changed again since
 * (to something other than what `after` set) is left alone: that later change is not the one refused.
 */
export function revertPatch(current: Task, before: Task, after: Task, patch: TaskPatch): Task {
  const reverted: Record<string, unknown> = { ...current };
  for (const field of Object.keys(patch) as (keyof TaskPatch)[]) {
    if (JSON.stringify(current[field]) === JSON.stringify(after[field])) reverted[field] = before[field];
  }
  return reverted as Task;
}

/**
 * The fields that differ between `before` and `after`. Sending only these means a device holding
 * an old copy of the task changes just what the user touched, instead of overwriting edits made
 * elsewhere with its stale values.
 */
export function diffTask(before: Task, after: Task): TaskPatch {
  const patch: Record<string, unknown> = {};
  for (const field of FIELDS) {
    if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) patch[field] = after[field];
  }
  return patch as TaskPatch;
}

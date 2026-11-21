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
];

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

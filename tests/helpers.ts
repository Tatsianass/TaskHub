import type { QuadrantId, Task } from '@/types/task';

let counter = 0;

export function makeTask(overrides: Partial<Task> = {}): Task {
  counter += 1;
  return {
    id: `t${counter}`,
    title: `Task ${counter}`,
    description: '',
    quadrantId: 'not-urgent-important',
    tag: null,
    done: false,
    completedAt: null,
    createdAt: 1_000 + counter,
    dueDate: null,
    remindMe: false,
    remindTime: null,
    remindOffsets: [],
    ...overrides,
  };
}

export const QUADRANT_IDS: QuadrantId[] = [
  'urgent-important',
  'not-urgent-important',
  'urgent-not-important',
  'not-urgent-not-important',
];

/** A translator that makes the key and params visible: `key|name=value`. */
export const tr = (key: string, params?: Record<string, string | number>) =>
  params ? `${key}|${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(',')}` : key;

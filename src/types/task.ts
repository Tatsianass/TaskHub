export type QuadrantId =
  | 'urgent-important'
  | 'not-urgent-important'
  | 'urgent-not-important'
  | 'not-urgent-not-important';

export type TagId = 'work' | 'home';

/** How often a task comes back once it's done. Needs a due date to count from. */
export type RepeatRule = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';

export type Task = {
  id: string;
  title: string;
  description: string;
  quadrantId: QuadrantId;
  tag: TagId | null;
  done: boolean;
  /** When it was marked done (ms since epoch); null while open, and for tasks finished before this was tracked. */
  completedAt: number | null;
  createdAt: number;
  dueDate: string | null;
  remindMe: boolean;
  remindTime: string | null;
  /** Minutes before `remindTime` at which to alert; `[0]` is the reminder itself, `[]` means none. */
  remindOffsets: number[];
  /** When set, finishing the task creates the next one on the following date. Missing on tasks saved before this existed. */
  repeat: RepeatRule | null;
};

export type QuadrantId =
  | 'urgent-important'
  | 'not-urgent-important'
  | 'urgent-not-important'
  | 'not-urgent-not-important';

export type TagId = 'work' | 'home';

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
};

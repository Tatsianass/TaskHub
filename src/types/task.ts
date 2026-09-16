export type QuadrantId =
  | 'urgent-important'
  | 'not-urgent-important'
  | 'urgent-not-important'
  | 'not-urgent-not-important';

export type Task = {
  id: string;
  title: string;
  description: string;
  quadrantId: QuadrantId;
  done: boolean;
  createdAt: number;
  dueDate: string | null;
};

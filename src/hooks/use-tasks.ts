import { useCallback } from 'react';

import { useServerList } from '@/hooks/use-server-list';
import { api } from '@/lib/api';
import { todayISODate } from '@/utils/dates';
import { isFollowUp, nextOccurrence } from '@/utils/recurrence';
import type { QuadrantId, RepeatRule, TagId, Task } from '@/types/task';

export type TaskDraft = {
  title: string;
  description: string;
  quadrantId: QuadrantId;
  tag: TagId | null;
  dueDate: string | null;
  /** The task's time of day; null means all-day, so alerts use the default reminder time. */
  remindTime: string | null;
  /** Alerts as minutes before the task's time; empty means no reminder. */
  remindOffsets: number[];
  /** Repeats after it's done; ignored (stored as none) when the task has no due date. */
  repeat: RepeatRule | null;
};

/** `remindMe` stays in step with the alerts so older readers (widgets, backups) keep working. */
function reminderFields(draft: TaskDraft) {
  return { remindMe: draft.remindOffsets.length > 0, remindTime: draft.remindTime, remindOffsets: draft.remindOffsets };
}

/** A repeat needs a date to count from. */
const repeatField = (draft: TaskDraft) => (draft.dueDate ? draft.repeat : null);

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const taskPath = (id: string) => `/tasks/${encodeURIComponent(id)}`;

export function useTasks() {
  const { items: tasks, isLoaded, error, clearError, mutate, refresh } = useServerList<Task>('/tasks');

  const insertTask = useCallback(
    (task: Task) =>
      mutate(
        (prev) => [task, ...prev],
        () => api('/tasks', { method: 'POST', body: task }),
        (prev) => prev.filter((item) => item.id !== task.id),
      ),
    [mutate],
  );

  const addTask = useCallback(
    (draft: TaskDraft) => {
      const title = draft.title.trim();
      if (!title) return;
      insertTask({
        id: newId(),
        title,
        description: draft.description.trim(),
        quadrantId: draft.quadrantId,
        tag: draft.tag,
        dueDate: draft.dueDate,
        ...reminderFields(draft),
        repeat: repeatField(draft),
        done: false,
        completedAt: null,
        createdAt: Date.now(),
      });
    },
    [insertTask],
  );

  /** Optimistically replaces task `id` with `change(task)` and PUTs the result. */
  const replaceTask = useCallback(
    (id: string, change: (task: Task) => Task) => {
      const previous = tasks.find((task) => task.id === id);
      if (!previous) return;
      const next = change(previous);
      mutate(
        (prev) => prev.map((task) => (task.id === id ? next : task)),
        () => api(taskPath(id), { method: 'PUT', body: next }),
        (prev) => prev.map((task) => (task.id === id ? previous : task)),
      );
    },
    [tasks, mutate],
  );

  const updateTask = useCallback(
    (id: string, draft: TaskDraft) => {
      const title = draft.title.trim();
      if (!title) return;
      replaceTask(id, (task) => ({
        ...task,
        title,
        description: draft.description.trim(),
        quadrantId: draft.quadrantId,
        tag: draft.tag,
        dueDate: draft.dueDate,
        ...reminderFields(draft),
        repeat: repeatField(draft),
      }));
    },
    [replaceTask],
  );

  const deleteTask = useCallback(
    (id: string) => {
      const removed = tasks.find((task) => task.id === id);
      if (!removed) return;
      mutate(
        (prev) => prev.filter((task) => task.id !== id),
        () => api(taskPath(id), { method: 'DELETE' }),
        (prev) => (prev.some((task) => task.id === id) ? prev : [removed, ...prev]),
      );
    },
    [tasks, mutate],
  );

  /**
   * Checks a task off or reopens it. Completing a repeating task also creates its next occurrence;
   * reopening it again (undo) removes that occurrence, unless it has been completed since.
   */
  const toggleTask = useCallback(
    (id: string) => {
      const task = tasks.find((item) => item.id === id);
      if (!task) return;
      replaceTask(id, (current) => ({ ...current, done: !current.done, completedAt: current.done ? null : Date.now() }));
      if (!task.repeat) return;
      if (task.done) {
        const followUp = tasks
          .filter((candidate) => isFollowUp(task, candidate) && candidate.createdAt >= (task.completedAt ?? 0))
          .sort((a, b) => a.createdAt - b.createdAt)[0];
        if (followUp) deleteTask(followUp.id);
      } else if (!tasks.some((candidate) => isFollowUp(task, candidate))) {
        const next = nextOccurrence(task, newId(), Date.now(), todayISODate());
        if (next) insertTask(next);
      }
    },
    [tasks, replaceTask, deleteTask, insertTask],
  );

  const rescheduleTask = useCallback(
    (id: string, dueDate: string) => replaceTask(id, (task) => ({ ...task, dueDate })),
    [replaceTask],
  );

  const clearCompleted = useCallback(() => {
    for (const task of tasks) if (task.done) deleteTask(task.id);
  }, [tasks, deleteTask]);

  return { tasks, isLoaded, addTask, updateTask, toggleTask, rescheduleTask, deleteTask, clearCompleted, error, clearError, refresh };
}

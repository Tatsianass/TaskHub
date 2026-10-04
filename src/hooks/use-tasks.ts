import { useCallback } from 'react';

import { useServerList } from '@/hooks/use-server-list';
import { api } from '@/lib/api';
import type { QuadrantId, TagId, Task } from '@/types/task';

export type TaskDraft = {
  title: string;
  description: string;
  quadrantId: QuadrantId;
  tag: TagId | null;
  dueDate: string | null;
  remindMe: boolean;
  remindTime: string | null;
};

const taskPath = (id: string) => `/tasks/${encodeURIComponent(id)}`;

export function useTasks() {
  const { items: tasks, isLoaded, error, clearError, mutate, refresh } = useServerList<Task>('/tasks');

  const addTask = useCallback(
    (draft: TaskDraft) => {
      const title = draft.title.trim();
      if (!title) return;
      const task: Task = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title,
        description: draft.description.trim(),
        quadrantId: draft.quadrantId,
        tag: draft.tag,
        dueDate: draft.dueDate,
        remindMe: draft.remindMe,
        remindTime: draft.remindTime,
        done: false,
        completedAt: null,
        createdAt: Date.now(),
      };
      mutate(
        (prev) => [task, ...prev],
        () => api('/tasks', { method: 'POST', body: task }),
        (prev) => prev.filter((item) => item.id !== task.id),
      );
    },
    [mutate],
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
        remindMe: draft.remindMe,
        remindTime: draft.remindTime,
      }));
    },
    [replaceTask],
  );

  const toggleTask = useCallback(
    (id: string) => replaceTask(id, (task) => ({ ...task, done: !task.done, completedAt: task.done ? null : Date.now() })),
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

  const clearCompleted = useCallback(() => {
    for (const task of tasks) if (task.done) deleteTask(task.id);
  }, [tasks, deleteTask]);

  return { tasks, isLoaded, addTask, updateTask, toggleTask, deleteTask, clearCompleted, error, clearError, refresh };
}

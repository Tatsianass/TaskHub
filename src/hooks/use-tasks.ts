import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { QuadrantId, TagId, Task } from '@/types/task';

const STORAGE_KEY = 'task-manager:tasks:v3';

export type TaskDraft = {
  title: string;
  description: string;
  quadrantId: QuadrantId;
  tag: TagId | null;
  dueDate: string | null;
  remindMe: boolean;
  remindTime: string | null;
};

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const hasLoaded = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setTasks(JSON.parse(raw) as Task[]);
      } finally {
        hasLoaded.current = true;
        setIsLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!hasLoaded.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)).catch(() => {});
  }, [tasks]);

  const addTask = useCallback((draft: TaskDraft) => {
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
      createdAt: Date.now(),
    };
    setTasks((prev) => [task, ...prev]);
  }, []);

  const updateTask = useCallback((id: string, draft: TaskDraft) => {
    const title = draft.title.trim();
    if (!title) return;
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id
          ? {
              ...task,
              title,
              description: draft.description.trim(),
              quadrantId: draft.quadrantId,
              tag: draft.tag,
              dueDate: draft.dueDate,
              remindMe: draft.remindMe,
              remindTime: draft.remindTime,
            }
          : task,
      ),
    );
  }, []);

  const toggleTask = useCallback((id: string) => {
    setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, done: !task.done } : task)));
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((task) => task.id !== id));
  }, []);

  return { tasks, isLoaded, addTask, updateTask, toggleTask, deleteTask };
}

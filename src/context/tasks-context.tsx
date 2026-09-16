import { createContext, useContext, type ReactNode } from 'react';

import { useTasks } from '@/hooks/use-tasks';

type TasksContextValue = ReturnType<typeof useTasks>;

const TasksContext = createContext<TasksContextValue | null>(null);

export function TasksProvider({ children }: { children: ReactNode }) {
  const value = useTasks();
  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>;
}

export function useTasksContext() {
  const context = useContext(TasksContext);
  if (!context) throw new Error('useTasksContext must be used within a TasksProvider');
  return context;
}

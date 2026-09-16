import { Redirect } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomTabBar } from '@/components/bottom-tab-bar';
import { TaskFormModal } from '@/components/task-form-modal';
import { TaskRow } from '@/components/task-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { QUADRANTS } from '@/constants/quadrants';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useLocale } from '@/context/locale-context';
import { useTasksContext } from '@/context/tasks-context';
import type { TaskDraft } from '@/hooks/use-tasks';
import type { Task } from '@/types/task';

export default function CalendarScreen() {
  const { user } = useAuth();
  const { t } = useLocale();
  const { tasks, isLoaded, updateTask, toggleTask, deleteTask } = useTasksContext();
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const datedTasks = useMemo(
    () =>
      tasks
        .filter((task): task is Task & { dueDate: string } => !!task.dueDate)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [tasks],
  );

  if (!user) return <Redirect href="/login" />;

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setIsModalOpen(true);
  };

  const handleSave = (draft: TaskDraft) => {
    if (editingTask) updateTask(editingTask.id, draft);
    setIsModalOpen(false);
  };

  const handleDelete = () => {
    if (editingTask) deleteTask(editingTask.id);
    setIsModalOpen(false);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle" style={styles.title}>
          {t('calendar.title')}
        </ThemedText>

        {isLoaded && (
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {datedTasks.length === 0 && (
              <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                {t('calendar.empty')}
              </ThemedText>
            )}
            {datedTasks.map((task) => {
              const quadrant = QUADRANTS.find((q) => q.id === task.quadrantId);
              return (
                <TaskRow
                  key={task.id}
                  task={task}
                  accentColor={quadrant?.color ?? '#A8C4E0'}
                  onToggle={() => toggleTask(task.id)}
                  onPress={() => openEditModal(task)}
                />
              );
            })}
          </ScrollView>
        )}

        <BottomTabBar />
      </SafeAreaView>

      <TaskFormModal
        visible={isModalOpen}
        initialTask={editingTask}
        defaultQuadrantId={editingTask?.quadrantId ?? QUADRANTS[0].id}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        onDelete={editingTask ? handleDelete : undefined}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  title: {
    fontSize: 22,
    marginBottom: Spacing.three,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: Spacing.three,
  },
  empty: {
    textAlign: 'center',
    marginTop: Spacing.five,
  },
});

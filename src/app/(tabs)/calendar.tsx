import { Redirect } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorBanner } from '@/components/error-banner';
import { GlassPanel } from '@/components/glass-panel';
import { TaskFormModal } from '@/components/task-form-modal';
import { TaskRow } from '@/components/task-row';
import { ThemedText } from '@/components/themed-text';
import { QUADRANTS } from '@/constants/quadrants';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useEscalationSettings } from '@/context/escalation-context';
import { useLocale } from '@/context/locale-context';
import { useTasksContext } from '@/context/tasks-context';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useTheme } from '@/hooks/use-theme';
import { effectiveQuadrantId, isEscalated } from '@/utils/priority';
import type { TaskDraft } from '@/hooks/use-tasks';
import type { Task } from '@/types/task';

export default function CalendarScreen() {
  const { user } = useAuth();
  const { t } = useLocale();
  const theme = useTheme();
  const { tasks, isLoaded, updateTask, toggleTask, deleteTask, error, clearError, refresh } = useTasksContext();
  const { escalationDays } = useEscalationSettings();
  const { refreshing, onRefresh } = usePullToRefresh(refresh);
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
    <>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.inner}>
        <ThemedText type="subtitle" style={styles.title}>
          {t('calendar.title')}
        </ThemedText>

        <ErrorBanner code={error} onDismiss={clearError} />

        {isLoaded && (
          <GlassPanel style={styles.listPanel} contentStyle={styles.listContent}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.text} />
              }>
              {datedTasks.length === 0 && (
                <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                  {t('calendar.empty')}
                </ThemedText>
              )}
              {datedTasks.map((task) => {
                const quadrant = QUADRANTS.find((q) => q.id === effectiveQuadrantId(task, escalationDays));
                return (
                  <TaskRow
                    key={task.id}
                    task={task}
                    accentColor={quadrant?.color ?? '#A8C4E0'}
                    escalated={isEscalated(task, escalationDays)}
                    onToggle={() => toggleTask(task.id)}
                    onPress={() => openEditModal(task)}
                  />
                );
              })}
            </ScrollView>
          </GlassPanel>
        )}
      </View>
      </SafeAreaView>

      <TaskFormModal
        visible={isModalOpen}
        initialTask={editingTask}
        defaultQuadrantId={editingTask?.quadrantId ?? QUADRANTS[0].id}
        tasks={tasks}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        onDelete={editingTask ? handleDelete : undefined}
        onToggleTask={toggleTask}
      />
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  inner: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  title: {
    fontSize: 22,
    marginBottom: Spacing.three,
  },
  listPanel: {
    flex: 1,
    marginBottom: Spacing.three,
  },
  // Fills the panel so pull-to-refresh works from anywhere in it, even when the list is short or empty.
  scrollContent: {
    flexGrow: 1,
  },
  listContent: {
    flex: 1,
    padding: Spacing.two,
  },
  empty: {
    textAlign: 'center',
    marginTop: Spacing.five,
  },
});

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { TaskFormModal } from '@/components/task-form-modal';
import { TaskRow } from '@/components/task-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { QUADRANTS } from '@/constants/quadrants';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/context/auth-context';
import { useLocale } from '@/context/locale-context';
import { useTasksContext } from '@/context/tasks-context';
import type { TaskDraft } from '@/hooks/use-tasks';
import type { Task } from '@/types/task';

type Filter = 'all' | 'active' | 'done';

export default function QuadrantScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { t } = useLocale();
  const { tasks, isLoaded, addTask, updateTask, toggleTask, deleteTask } = useTasksContext();
  const theme = useTheme();

  const [filter, setFilter] = useState<Filter>('all');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const quadrant = QUADRANTS.find((q) => q.id === id);

  const quadrantTasks = useMemo(
    () => tasks.filter((task) => task.quadrantId === id).sort((a, b) => b.createdAt - a.createdAt),
    [tasks, id],
  );
  const activeTasks = quadrantTasks.filter((task) => !task.done);
  const doneTasks = quadrantTasks.filter((task) => task.done);
  const visibleTasks = filter === 'active' ? activeTasks : filter === 'done' ? doneTasks : quadrantTasks;

  if (!user) return <Redirect href="/login" />;
  if (!quadrant) return <Redirect href="/" />;

  const openCreateModal = () => {
    setEditingTask(null);
    setIsModalOpen(true);
  };

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setIsModalOpen(true);
  };

  const handleSave = (draft: TaskDraft) => {
    if (editingTask) {
      updateTask(editingTask.id, draft);
    } else {
      addTask(draft);
    }
    setIsModalOpen(false);
  };

  const handleDelete = () => {
    if (editingTask) deleteTask(editingTask.id);
    setIsModalOpen(false);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <ThemedText style={styles.back}>←</ThemedText>
          </Pressable>
        </View>

        <View style={styles.header}>
          <View style={[styles.iconBadge, { backgroundColor: quadrant.color }]}>
            <ThemedText style={styles.icon}>{quadrant.icon}</ThemedText>
          </View>
          <View style={styles.headerText}>
            <ThemedText type="subtitle" style={styles.title}>
              {t(quadrant.titleKey)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t(quadrant.subtitleKey)}
            </ThemedText>
          </View>
        </View>

        <View style={styles.tabs}>
          {(
            [
              ['all', `${t('quadrantScreen.all')} (${quadrantTasks.length})`],
              ['active', `${t('quadrantScreen.active')} (${activeTasks.length})`],
              ['done', `${t('quadrantScreen.done')} (${doneTasks.length})`],
            ] as [Filter, string][]
          ).map(([value, label]) => (
            <Pressable
              key={value}
              onPress={() => setFilter(value)}
              style={[
                styles.tab,
                { borderColor: theme.border },
                filter === value && { backgroundColor: quadrant.color, borderColor: quadrant.color },
              ]}>
              <ThemedText
                type="small"
                style={filter === value ? { color: theme.cardText } : undefined}
                themeColor={filter === value ? undefined : 'textSecondary'}>
                {label}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        {isLoaded && (
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {visibleTasks.length === 0 && (
              <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                {t('quadrantScreen.empty')}
              </ThemedText>
            )}
            {visibleTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                accentColor={quadrant.color}
                onToggle={() => toggleTask(task.id)}
                onPress={() => openEditModal(task)}
              />
            ))}
          </ScrollView>
        )}

        <View style={styles.fabRow}>
          <PrimaryButton
            title={`+  ${t('quadrantScreen.addTask')}`}
            onPress={openCreateModal}
            style={{ backgroundColor: quadrant.color }}
            textColor={theme.cardText}
          />
        </View>
      </SafeAreaView>

      <TaskFormModal
        visible={isModalOpen}
        initialTask={editingTask}
        defaultQuadrantId={quadrant.id}
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
  topBar: {
    marginBottom: Spacing.two,
  },
  back: {
    fontSize: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 22,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 20,
  },
  tabs: {
    flexDirection: 'row',
    gap: Spacing.one,
    marginBottom: Spacing.two,
  },
  tab: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.four,
    borderWidth: 1,
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
  fabRow: {
    paddingVertical: Spacing.three,
  },
});

import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';

import { AuroraBackground } from '@/components/aurora-background';
import { BottomTabBar } from '@/components/bottom-tab-bar';
import { GlassPanel } from '@/components/glass-panel';
import { TaskFormModal } from '@/components/task-form-modal';
import { TaskRow } from '@/components/task-row';
import { ThemedText } from '@/components/themed-text';
import { QUADRANTS } from '@/constants/quadrants';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useLocale } from '@/context/locale-context';
import { useTasksContext } from '@/context/tasks-context';
import { useTheme } from '@/hooks/use-theme';
import { hexToRgba } from '@/utils/colors';
import type { TaskDraft } from '@/hooks/use-tasks';
import type { QuadrantId, Task } from '@/types/task';

export default function HomeScreen() {
  const { user } = useAuth();
  const { t } = useLocale();
  const theme = useTheme();
  const { tasks, isLoaded, addTask, updateTask, toggleTask, deleteTask } = useTasksContext();

  const [activeQuadrantId, setActiveQuadrantId] = useState<QuadrantId>(QUADRANTS[0].id);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (!user) return <Redirect href="/login" />;

  const activeQuadrant = QUADRANTS.find((quadrant) => quadrant.id === activeQuadrantId) ?? QUADRANTS[0];
  const quadrantTasks = tasks
    .filter((task) => task.quadrantId === activeQuadrantId)
    .sort((a, b) => b.createdAt - a.createdAt);

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
    <AuroraBackground>
      <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerSpacer} />
          <View style={styles.headerCenter}>
            <ThemedText type="subtitle" style={styles.brand}>
              {t('app.brand')}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('home.subtitle')}
            </ThemedText>
          </View>
          <Pressable
            onPress={openCreateModal}
            hitSlop={10}
            style={[styles.iconButton, { borderColor: theme.glassBorder, backgroundColor: theme.glassBg }]}>
            <ThemedText style={styles.icon}>➕</ThemedText>
          </Pressable>
        </View>

        <GlassPanel style={styles.tabs} contentStyle={styles.tabsContent}>
          {QUADRANTS.map((quadrant) => {
            const isActive = quadrant.id === activeQuadrantId;
            return (
              <Pressable key={quadrant.id} style={styles.tabWrapper} onPress={() => setActiveQuadrantId(quadrant.id)}>
                <View
                  style={[
                    styles.tabItem,
                    isActive && {
                      backgroundColor: hexToRgba(quadrant.color, 0.32),
                      borderColor: theme.glassBorder,
                    },
                  ]}>
                  <ThemedText style={styles.tabIcon}>{quadrant.icon}</ThemedText>
                  <ThemedText type="small" themeColor={isActive ? 'text' : 'textSecondary'}>
                    {t(quadrant.shortLabelKey)}
                  </ThemedText>
                </View>
              </Pressable>
            );
          })}
        </GlassPanel>

        <ThemedText type="smallBold" style={styles.sectionTitle}>
          {t(activeQuadrant.titleKey)}
        </ThemedText>

        {isLoaded && (
          <GlassPanel style={styles.listPanel} contentStyle={styles.listContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {quadrantTasks.length === 0 && (
                <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                  {t('quadrantScreen.empty')}
                </ThemedText>
              )}
              {quadrantTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  accentColor={activeQuadrant.color}
                  onToggle={() => toggleTask(task.id)}
                  onPress={() => openEditModal(task)}
                />
              ))}
            </ScrollView>
          </GlassPanel>
        )}

        <BottomTabBar />
      </View>
      </SafeAreaView>

      <TaskFormModal
        visible={isModalOpen}
        initialTask={editingTask}
        defaultQuadrantId={activeQuadrantId}
        tasks={tasks}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        onDelete={editingTask ? handleDelete : undefined}
        onToggleTask={toggleTask}
      />
    </AuroraBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.three,
  },
  headerSpacer: {
    width: 34,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  brand: {
    fontSize: 22,
    textAlign: 'center',
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 15,
  },
  tabs: {
    marginBottom: Spacing.three,
  },
  tabsContent: {
    flexDirection: 'row',
    gap: Spacing.one,
    padding: Spacing.one,
  },
  tabWrapper: {
    flex: 1,
  },
  tabItem: {
    alignItems: 'center',
    gap: 3,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabIcon: {
    fontSize: 17,
  },
  sectionTitle: {
    marginBottom: Spacing.two,
  },
  listPanel: {
    flex: 1,
    marginBottom: Spacing.three,
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

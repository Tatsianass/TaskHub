import { Redirect, useFocusEffect, useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ErrorBanner } from '@/components/error-banner';
import { GlassPanel } from '@/components/glass-panel';
import { CheckCircleIcon, PlusIcon } from '@/components/header-icons';
import { TaskFormModal } from '@/components/task-form-modal';
import { TaskRow } from '@/components/task-row';
import { ThemedText } from '@/components/themed-text';
import { UndoToast } from '@/components/undo-toast';
import { QUADRANTS } from '@/constants/quadrants';
import { TAGS } from '@/constants/tags';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useEscalationSettings } from '@/context/escalation-context';
import { useLocale } from '@/context/locale-context';
import { useTasksContext } from '@/context/tasks-context';
import { useToday } from '@/context/today-context';
import { useEscalationSeen } from '@/hooks/use-escalation-seen';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useTheme } from '@/hooks/use-theme';
import { hexToRgba } from '@/utils/colors';
import { isoDateOf } from '@/utils/dates';
import { effectiveQuadrantId, isEscalated } from '@/utils/priority';
import type { TaskDraft } from '@/hooks/use-tasks';
import type { QuadrantId, TagId, Task } from '@/types/task';

type TagFilter = TagId | 'all';

/** Wall-clock time, callable from gesture worklets and JS handlers alike. */
function currentTime() {
  'worklet';
  return Date.now();
}

export default function HomeScreen() {
  const { user } = useAuth();
  const { t } = useLocale();
  const theme = useTheme();
  const { tasks, isLoaded, addTask, updateTask, toggleTask, deleteTask, error, clearError, refresh } = useTasksContext();
  const { escalationDays } = useEscalationSettings();
  const today = useToday();
  const { refreshing, onRefresh } = usePullToRefresh(refresh);

  const [activeQuadrantId, setActiveQuadrantId] = useState<QuadrantId>(QUADRANTS[0].id);
  const [activeTagFilter, setActiveTagFilter] = useState<TagFilter>('all');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  // The task just checked off, offered for undo until the toast times out.
  const [justCompletedId, setJustCompletedId] = useState<string | null>(null);
  const isFocused = useIsFocused();
  const router = useRouter();
  const { add } = useLocalSearchParams<{ add?: string }>();

  // A finished task stays struck through in its quadrant for the rest of the day, then lives
  // only on the Completed screen.
  const completedToday = (task: Task) => task.done && task.completedAt !== null && isoDateOf(task.completedAt) === today;
  const completedTodayCount = tasks.filter(completedToday).length;

  const handleToggle = (task: Task) => {
    toggleTask(task.id);
    setJustCompletedId(task.done ? null : task.id);
  };
  const dismissToast = useCallback(() => setJustCompletedId(null), []);

  const tasksFor = (quadrantId: QuadrantId) =>
    tasks
      .filter((task) => !task.done || completedToday(task))
      .filter((task) => effectiveQuadrantId(task, escalationDays, today) === quadrantId)
      .filter((task) => activeTagFilter === 'all' || task.tag === activeTagFilter)
      .sort((a, b) => b.createdAt - a.createdAt);

  // Tasks the deadline setting moved into another quadrant that the user hasn't looked at yet:
  // counted on the quadrant tabs, and highlighted as "New" while the user views that quadrant.
  const escalated = isLoaded ? tasks.filter((task) => isEscalated(task, escalationDays, today)) : null;
  const { unseen, markSeen, arrivals, clearArrivals } = useEscalationSeen(escalated);
  const unseenIn = (quadrantId: QuadrantId) =>
    tasksFor(quadrantId)
      .filter((task) => unseen.has(task.id))
      .map((task) => task.id);
  // Looking at a quadrant marks its arrivals as seen; they stay highlighted until the user
  // switches quadrant or leaves the Tasks tab.
  const arrivedKey = unseenIn(activeQuadrantId).join('|');
  useEffect(() => {
    if (isFocused && arrivedKey) markSeen(arrivedKey.split('|'), activeQuadrantId);
  }, [isFocused, activeQuadrantId, arrivedKey, markSeen]);

  useFocusEffect(useCallback(() => clearArrivals, [clearArrivals]));

  // The widget's "+" button opens the app at `?add=1`: show the new-task form, then clear the param.
  useFocusEffect(
    useCallback(() => {
      if (add !== '1') return;
      setEditingTask(null);
      setIsModalOpen(true);
      router.setParams({ add: undefined });
    }, [add, router]),
  );

  const selectQuadrant = (quadrantId: QuadrantId) => {
    setActiveQuadrantId(quadrantId);
    clearArrivals();
  };

  const switchQuadrant = (direction: 1 | -1) => {
    const currentIndex = QUADRANTS.findIndex((quadrant) => quadrant.id === activeQuadrantId);
    const nextIndex = currentIndex + direction;
    if (nextIndex >= 0 && nextIndex < QUADRANTS.length) {
      selectQuadrant(QUADRANTS[nextIndex].id);
    }
  };

  // A horizontal swipe also ends as a press on whatever it started on (a task row or the
  // "tap to add" area), so presses right after a swipe are ignored.
  const swipedAt = useSharedValue(0);
  const justSwiped = () => currentTime() - swipedAt.value < 400;

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-15, 15])
    .onStart(() => {
      swipedAt.value = currentTime();
    })
    .onEnd((event) => {
      if (event.translationX < -60) {
        runOnJS(switchQuadrant)(1);
      } else if (event.translationX > 60) {
        runOnJS(switchQuadrant)(-1);
      }
    });

  if (!user) return <Redirect href="/login" />;

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
    <>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.push('/completed')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('completed.open')}
            style={[styles.iconButton, { borderColor: theme.primary, borderWidth: 1.5, backgroundColor: theme.glassBg }]}>
            <CheckCircleIcon color={theme.primary} />
            {completedTodayCount > 0 && (
              <View style={[styles.countBadge, { backgroundColor: theme.primary }]}>
                <ThemedText style={[styles.badgeText, { color: theme.background }]}>{completedTodayCount}</ThemedText>
              </View>
            )}
          </Pressable>
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
            <PlusIcon color={theme.text} />
          </Pressable>
        </View>

        <ErrorBanner code={error} onDismiss={clearError} />

        <View style={styles.tagFilterRow}>
          <Pressable onPress={() => setActiveTagFilter('all')}>
            <View
              style={[
                styles.tagPill,
                { borderColor: theme.glassBorder, backgroundColor: theme.glassBg },
                activeTagFilter === 'all' && { backgroundColor: theme.backgroundSelected },
              ]}>
              <ThemedText type="small" themeColor={activeTagFilter === 'all' ? 'text' : 'textSecondary'}>
                {t('tagFilter.all')}
              </ThemedText>
            </View>
          </Pressable>
          {TAGS.map((tagOption) => {
            const isActive = activeTagFilter === tagOption.id;
            return (
              <Pressable key={tagOption.id} onPress={() => setActiveTagFilter(tagOption.id)}>
                <View
                  style={[
                    styles.tagPill,
                    { borderColor: theme.glassBorder, backgroundColor: theme.glassBg },
                    isActive && { backgroundColor: theme.backgroundSelected },
                  ]}>
                  <ThemedText type="small" themeColor={isActive ? 'text' : 'textSecondary'}>
                    {tagOption.icon} {t(tagOption.labelKey)}
                  </ThemedText>
                </View>
              </Pressable>
            );
          })}
        </View>

        <GlassPanel style={styles.tabs} contentStyle={styles.tabsContent}>
          {QUADRANTS.map((quadrant) => {
            const isActive = quadrant.id === activeQuadrantId;
            // The quadrant being looked at marks its arrivals as seen, so it never shows a count.
            const newCount = isActive && isFocused ? 0 : unseenIn(quadrant.id).length;
            const label = t(quadrant.shortLabelKey);
            return (
              <Pressable
                key={quadrant.id}
                style={styles.tabWrapper}
                onPress={() => selectQuadrant(quadrant.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={
                  newCount > 0 ? `${label}, ${t('escalation.newCount', { count: newCount })}` : label
                }>
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
                    {label}
                  </ThemedText>
                  {newCount > 0 && (
                    <View style={[styles.badge, { backgroundColor: theme.primary }]}>
                      <ThemedText style={[styles.badgeText, { color: theme.background }]}>{newCount}</ThemedText>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}
        </GlassPanel>

        <GestureDetector gesture={swipeGesture}>
          {/* All four quadrants are stacked and cross-fade like the bottom tabs; each keeps its own scroll position. */}
          <View style={styles.page}>
            {QUADRANTS.map((quadrant) => {
              const quadrantTasks = tasksFor(quadrant.id);
              return (
                <CrossFade key={quadrant.id} active={quadrant.id === activeQuadrantId}>
                  <ThemedText type="smallBold" style={styles.sectionTitle}>
                    {t(quadrant.titleKey)}
                  </ThemedText>

                  {isLoaded && (
                    <GlassPanel style={styles.listPanel} contentStyle={styles.listContent}>
                      <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.scrollContent}
                        refreshControl={
                          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.text} />
                        }>
                        {quadrantTasks.map((task) => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            accentColor={quadrant.color}
                            escalated={isEscalated(task, escalationDays, today)}
                            isNew={arrivals?.quadrantId === quadrant.id && arrivals.ids.includes(task.id)}
                            onToggle={() => !justSwiped() && handleToggle(task)}
                            onPress={() => !justSwiped() && openEditModal(task)}
                          />
                        ))}
                        {/* Tapping the free space below the tasks adds one to the active quadrant. */}
                        <Pressable style={styles.addArea} onPress={() => !justSwiped() && openCreateModal()}>
                          {quadrantTasks.length === 0 && (
                            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                              {t('quadrantScreen.empty')}
                            </ThemedText>
                          )}
                        </Pressable>
                      </ScrollView>
                    </GlassPanel>
                  )}
                </CrossFade>
              );
            })}
          </View>
        </GestureDetector>

        {justCompletedId && (
          <UndoToast
            message={t('completed.toast')}
            actionLabel={t('completed.undo')}
            onAction={() => {
              toggleTask(justCompletedId);
              dismissToast();
            }}
            onDismiss={dismissToast}
          />
        )}
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
    </>
  );
}

/** Same timing as the bottom tabs' fade (react-navigation's FadeSpec): 150ms linear. */
const FADE = { duration: 150, easing: Easing.linear };

function CrossFade({ active, children }: { active: boolean; children: ReactNode }) {
  const opacity = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    opacity.value = withTiming(active ? 1 : 0, FADE);
  }, [active, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, animatedStyle]}
      pointerEvents={active ? 'auto' : 'none'}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}>
      {children}
    </Animated.View>
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.three,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagFilterRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  tagPill: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 999,
    borderWidth: 1,
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
  badge: {
    position: 'absolute',
    top: 2,
    right: 6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
  },
  tabIcon: {
    fontSize: 17,
  },
  page: {
    flex: 1,
  },
  sectionTitle: {
    marginBottom: Spacing.two,
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
  addArea: {
    flexGrow: 1,
    minHeight: 64,
  },
  empty: {
    textAlign: 'center',
    marginTop: Spacing.five,
  },
});

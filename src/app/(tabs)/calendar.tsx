import { Redirect } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, runOnJS } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorBanner } from '@/components/error-banner';
import { PlusIcon } from '@/components/header-icons';
import { GlassPanel } from '@/components/glass-panel';
import { MonthGrid, type DayMarks } from '@/components/month-grid';
import { TaskFormModal } from '@/components/task-form-modal';
import { TaskRow } from '@/components/task-row';
import { ThemedText } from '@/components/themed-text';
import { QUADRANTS } from '@/constants/quadrants';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useBirthdaysContext } from '@/context/birthdays-context';
import { useEscalationSettings } from '@/context/escalation-context';
import { useLocale } from '@/context/locale-context';
import { useTasksContext } from '@/context/tasks-context';
import { useToday } from '@/context/today-context';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useTheme } from '@/hooks/use-theme';
import { hexToRgba } from '@/utils/colors';
import { birthdayInYear } from '@/utils/dates';
import { effectiveQuadrantId, isEscalated } from '@/utils/priority';
import type { TaskDraft } from '@/hooks/use-tasks';
import type { Task } from '@/types/task';

const FALLBACK_COLOR = '#A8C4E0';

function parseISODate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default function CalendarScreen() {
  const { user } = useAuth();
  const { t, locale } = useLocale();
  const theme = useTheme();
  const { tasks, isLoaded, addTask, updateTask, toggleTask, deleteTask, error, pendingWrites, clearError, refresh } =
    useTasksContext();
  const { birthdays, refresh: refreshBirthdays } = useBirthdaysContext();
  const { escalationDays } = useEscalationSettings();
  const { refreshing, onRefresh } = usePullToRefresh(() => Promise.all([refresh(), refreshBirthdays()]));

  const today = useToday();
  const [selected, setSelected] = useState(today);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // English calendars start on Sunday; every other supported language starts on Monday.
  const weekStartsOn = locale === 'en' ? 0 : 1;
  const weekdayLabels = useMemo(() => {
    const format = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    // 2024-01-07 was a Sunday.
    return Array.from({ length: 7 }, (_, index) => format.format(new Date(2024, 0, 7 + weekStartsOn + index)));
  }, [locale, weekStartsOn]);

  const colorFor = (task: Task) =>
    QUADRANTS.find((quadrant) => quadrant.id === effectiveQuadrantId(task, escalationDays, today))?.color ?? FALLBACK_COLOR;

  const marks = useMemo(() => {
    const byDate = new Map<string, DayMarks>();
    const markFor = (date: string) => {
      let mark = byDate.get(date);
      if (!mark) {
        mark = { dots: [], birthday: false };
        byDate.set(date, mark);
      }
      return mark;
    };
    for (const task of tasks) {
      if (!task.dueDate) continue;
      const color =
        QUADRANTS.find((quadrant) => quadrant.id === effectiveQuadrantId(task, escalationDays, today))?.color ??
        FALLBACK_COLOR;
      markFor(task.dueDate).dots.push({ color, done: task.done });
    }
    // The grid can show a few days of the neighbouring years (late Dec / early Jan).
    for (const birthday of birthdays) {
      for (const year of [visibleMonth.year - 1, visibleMonth.year, visibleMonth.year + 1]) {
        markFor(birthdayInYear(birthday.date, year)).birthday = true;
      }
    }
    return byDate;
  }, [tasks, birthdays, escalationDays, today, visibleMonth.year]);

  if (!user) return <Redirect href="/login" />;

  const selectedYear = Number(selected.slice(0, 4));
  const dayBirthdays = birthdays.filter((birthday) => birthdayInYear(birthday.date, selectedYear) === selected);
  const dayTasks = tasks
    .filter((task) => task.dueDate === selected)
    .sort((a, b) => Number(a.done) - Number(b.done) || a.createdAt - b.createdAt);

  const monthName = capitalize(
    new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(visibleMonth.year, visibleMonth.month, 1)),
  );
  const todayDate = parseISODate(today);
  const viewingToday = visibleMonth.year === todayDate.getFullYear() && visibleMonth.month === todayDate.getMonth();
  const selectedTitle = capitalize(
    new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(
      parseISODate(selected),
    ),
  );

  const shiftMonth = (delta: 1 | -1) =>
    setVisibleMonth(({ year, month }) => {
      const next = new Date(year, month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });

  const selectDay = (date: string) => {
    setSelected(date);
    const day = parseISODate(date);
    // Tapping a greyed-out day from the neighbouring month jumps to that month.
    setVisibleMonth({ year: day.getFullYear(), month: day.getMonth() });
  };

  const goToToday = () => selectDay(today);

  const monthSwipe = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-15, 15])
    .onEnd((event) => {
      if (event.translationX < -60) runOnJS(shiftMonth)(1);
      else if (event.translationX > 60) runOnJS(shiftMonth)(-1);
    });

  const openCreateModal = () => {
    setEditingTask(null);
    setIsModalOpen(true);
  };

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setIsModalOpen(true);
  };

  const handleSave = (draft: TaskDraft) => {
    if (editingTask) updateTask(editingTask.id, draft);
    else addTask(draft);
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
          <View style={styles.header}>
            <ThemedText type="subtitle" style={styles.title}>
              {t('calendar.title')}
            </ThemedText>
            <Pressable
              onPress={openCreateModal}
              hitSlop={10}
              style={[styles.iconButton, { borderColor: theme.glassBorder, backgroundColor: theme.glassBg }]}>
              <PlusIcon color={theme.text} />
            </Pressable>
          </View>

          <ErrorBanner code={error ?? (pendingWrites > 0 ? 'QUEUED_OFFLINE' : null)} info={!error} onDismiss={clearError} />

          <GestureDetector gesture={monthSwipe}>
            <GlassPanel style={styles.monthPanel} contentStyle={styles.monthContent}>
              <View style={styles.monthHeader}>
                <Pressable onPress={goToToday} hitSlop={8} style={styles.monthTitleRow}>
                  <ThemedText style={styles.monthName}>{monthName}</ThemedText>
                  <ThemedText themeColor="textSecondary" style={styles.monthYear}>
                    {visibleMonth.year}
                  </ThemedText>
                </Pressable>
                <View style={styles.monthArrows}>
                  {/* Only offered once you've wandered off today, so it never competes with the arrows. */}
                  {!viewingToday && (
                    <Pressable
                      onPress={goToToday}
                      hitSlop={8}
                      style={[styles.todayPill, { backgroundColor: hexToRgba(theme.primary, 0.18) }]}>
                      <ThemedText type="small" themeColor="primary">
                        {t('calendar.today')}
                      </ThemedText>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => shiftMonth(-1)}
                    hitSlop={8}
                    accessibilityLabel={t('calendar.prevMonth')}
                    style={[styles.arrow, { borderColor: theme.glassBorder, backgroundColor: theme.glassBg }]}>
                    <ThemedText style={styles.arrowText}>‹</ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={() => shiftMonth(1)}
                    hitSlop={8}
                    accessibilityLabel={t('calendar.nextMonth')}
                    style={[styles.arrow, { borderColor: theme.glassBorder, backgroundColor: theme.glassBg }]}>
                    <ThemedText style={styles.arrowText}>›</ThemedText>
                  </Pressable>
                </View>
              </View>
              <Animated.View key={`${visibleMonth.year}-${visibleMonth.month}`} entering={FadeIn.duration(180)}>
                <MonthGrid
                  year={visibleMonth.year}
                  month={visibleMonth.month}
                  weekStartsOn={weekStartsOn}
                  weekdayLabels={weekdayLabels}
                  today={today}
                  selected={selected}
                  marks={marks}
                  onSelect={selectDay}
                />
              </Animated.View>
            </GlassPanel>
          </GestureDetector>

          <View style={styles.dayHeader}>
            <ThemedText type="smallBold" style={styles.dayTitle} numberOfLines={1}>
              {selected === today ? `${t('calendar.today')} · ${selectedTitle}` : selectedTitle}
            </ThemedText>
            {(dayTasks.length > 0 || dayBirthdays.length > 0) && (
              <ThemedText type="small" themeColor="textSecondary">
                {[
                  dayTasks.length > 0 && `☑ ${dayTasks.length}`,
                  dayBirthdays.length > 0 && `🎂 ${dayBirthdays.length}`,
                ]
                  .filter(Boolean)
                  .join('  ·  ')}
              </ThemedText>
            )}
          </View>

          <GlassPanel style={styles.listPanel} contentStyle={styles.listContent}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.text} />}>
              {dayBirthdays.map((birthday) => (
                <View
                  key={birthday.id}
                  style={[
                    styles.birthdayRow,
                    {
                      backgroundColor: hexToRgba(theme.blobs[2], 0.16),
                      borderColor: hexToRgba(theme.blobs[2], 0.4),
                    },
                  ]}>
                  <View style={[styles.birthdayAvatar, { backgroundColor: hexToRgba(theme.blobs[2], 0.32) }]}>
                    <ThemedText style={styles.birthdayIcon}>🎂</ThemedText>
                  </View>
                  <ThemedText type="smallBold" style={styles.birthdayText}>
                    {t('calendar.birthday', { name: birthday.name })}
                  </ThemedText>
                </View>
              ))}
              {isLoaded &&
                dayTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    accentColor={colorFor(task)}
                    escalated={isEscalated(task, escalationDays, today)}
                    onToggle={() => toggleTask(task.id)}
                    onPress={() => openEditModal(task)}
                  />
                ))}
              {/* Tapping the free space below adds a task on the selected day. */}
              <Pressable style={styles.addArea} onPress={openCreateModal}>
                {isLoaded && dayTasks.length === 0 && dayBirthdays.length === 0 && (
                  <View style={styles.emptyState}>
                    <View style={[styles.emptyPlus, { borderColor: theme.glassBorder, backgroundColor: theme.glassBg }]}>
                      <PlusIcon color={theme.primary} />
                    </View>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                      {t('calendar.dayEmpty')}
                    </ThemedText>
                  </View>
                )}
              </Pressable>
            </ScrollView>
          </GlassPanel>
        </View>
      </SafeAreaView>

      <TaskFormModal
        visible={isModalOpen}
        initialTask={editingTask}
        defaultQuadrantId={editingTask?.quadrantId ?? QUADRANTS[0].id}
        defaultDueDate={selected}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.three,
  },
  title: {
    fontSize: 22,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthPanel: {
    marginBottom: Spacing.three,
  },
  monthContent: {
    padding: Spacing.two,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.two,
    marginBottom: Spacing.two,
  },
  monthTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.one + 2,
  },
  monthName: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '600',
  },
  monthYear: {
    fontSize: 15,
  },
  monthArrows: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  todayPill: {
    borderRadius: 999,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: 3,
  },
  arrow: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowText: {
    fontSize: 18,
    lineHeight: 22,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.two,
    marginBottom: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  dayTitle: {
    flexShrink: 1,
    fontSize: 15,
  },
  listPanel: {
    flex: 1,
    marginBottom: Spacing.three,
  },
  listContent: {
    flex: 1,
    padding: Spacing.two,
  },
  // Fills the panel so pull-to-refresh and "tap to add" work from anywhere in it.
  scrollContent: {
    flexGrow: 1,
  },
  birthdayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    padding: Spacing.two,
    marginBottom: Spacing.one,
    borderRadius: Spacing.three,
    borderWidth: 1,
  },
  birthdayAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  birthdayIcon: {
    fontSize: 18,
    lineHeight: 24,
  },
  birthdayText: {
    flex: 1,
  },
  addArea: {
    flexGrow: 1,
    minHeight: 64,
  },
  emptyState: {
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  emptyPlus: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    textAlign: 'center',
  },
});

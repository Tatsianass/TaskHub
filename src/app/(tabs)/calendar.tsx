import { Redirect } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
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
import { effectiveQuadrantId, isEscalated } from '@/utils/priority';
import type { TaskDraft } from '@/hooks/use-tasks';
import type { Birthday } from '@/types/birthday';
import type { Task } from '@/types/task';

const FALLBACK_COLOR = '#A8C4E0';

function parseISODate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Where a birthday falls in `year`: Feb 29 birthdays show on Feb 28 in non-leap years. */
function birthdayInYear(birthday: Birthday, year: number) {
  const monthDay = birthday.date.slice(5);
  const shown = monthDay === '02-29' && !isLeapYear(year) ? '02-28' : monthDay;
  return `${year}-${shown}`;
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default function CalendarScreen() {
  const { user } = useAuth();
  const { t, locale } = useLocale();
  const theme = useTheme();
  const { tasks, isLoaded, addTask, updateTask, toggleTask, deleteTask, error, clearError, refresh } =
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
        markFor(birthdayInYear(birthday, year)).birthday = true;
      }
    }
    return byDate;
  }, [tasks, birthdays, escalationDays, today, visibleMonth.year]);

  if (!user) return <Redirect href="/login" />;

  const selectedYear = Number(selected.slice(0, 4));
  const dayBirthdays = birthdays.filter((birthday) => birthdayInYear(birthday, selectedYear) === selected);
  const dayTasks = tasks
    .filter((task) => task.dueDate === selected)
    .sort((a, b) => Number(a.done) - Number(b.done) || a.createdAt - b.createdAt);

  const monthTitle = capitalize(
    new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
      new Date(visibleMonth.year, visibleMonth.month, 1),
    ),
  );
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

          <ErrorBanner code={error} onDismiss={clearError} />

          <GestureDetector gesture={monthSwipe}>
            <GlassPanel style={styles.monthPanel} contentStyle={styles.monthContent}>
              <View style={styles.monthHeader}>
                <Pressable onPress={goToToday} hitSlop={8}>
                  <ThemedText type="smallBold" style={styles.monthTitle}>
                    {monthTitle}
                  </ThemedText>
                </Pressable>
                <View style={styles.monthArrows}>
                  <Pressable
                    onPress={() => shiftMonth(-1)}
                    hitSlop={8}
                    accessibilityLabel={t('calendar.prevMonth')}
                    style={[styles.arrow, { borderColor: theme.glassBorder }]}>
                    <ThemedText>‹</ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={() => shiftMonth(1)}
                    hitSlop={8}
                    accessibilityLabel={t('calendar.nextMonth')}
                    style={[styles.arrow, { borderColor: theme.glassBorder }]}>
                    <ThemedText>›</ThemedText>
                  </Pressable>
                </View>
              </View>
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
            </GlassPanel>
          </GestureDetector>

          <ThemedText type="smallBold" style={styles.dayTitle}>
            {selected === today ? `${t('calendar.today')} · ${selectedTitle}` : selectedTitle}
          </ThemedText>

          <GlassPanel style={styles.listPanel} contentStyle={styles.listContent}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.text} />}>
              {dayBirthdays.map((birthday) => (
                <View key={birthday.id} style={styles.birthdayRow}>
                  <ThemedText style={styles.birthdayIcon}>🎂</ThemedText>
                  <ThemedText type="smallBold">{t('calendar.birthday', { name: birthday.name })}</ThemedText>
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
                  <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                    {t('calendar.dayEmpty')}
                  </ThemedText>
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
  monthTitle: {
    fontSize: 17,
  },
  monthArrows: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  arrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayTitle: {
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
  // Fills the panel so pull-to-refresh and "tap to add" work from anywhere in it.
  scrollContent: {
    flexGrow: 1,
  },
  birthdayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two + 2,
  },
  birthdayIcon: {
    fontSize: 18,
  },
  addArea: {
    flexGrow: 1,
    minHeight: 64,
  },
  empty: {
    textAlign: 'center',
    marginTop: Spacing.four,
  },
});

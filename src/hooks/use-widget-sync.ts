import { useEffect } from 'react';
import { Platform } from 'react-native';

import { QUADRANTS } from '@/constants/quadrants';
import { useEscalationSettings } from '@/context/escalation-context';
import { useLocale } from '@/context/locale-context';
import { useTasksContext } from '@/context/tasks-context';
import { useToday } from '@/context/today-context';
import { formatDueDate } from '@/utils/dates';
import { effectiveQuadrantId } from '@/utils/priority';
import type { QuadrantId } from '@/types/task';
import MatrixWidget from '@/widgets/matrix-widget';
import NextWidget from '@/widgets/next-widget';
import TodayWidget from '@/widgets/today-widget';

const DOT_COLORS: Record<QuadrantId, string> = {
  'urgent-important': '#FF375F',
  'not-urgent-important': '#FF9A62',
  'urgent-not-important': '#A8C4E0',
  'not-urgent-not-important': '#EE8FA6',
};

// Solid tints (the widget runtime gets plain colours, no alpha blending against the background).
const CELL_COLORS: Record<QuadrantId, string> = {
  'urgent-important': '#7A2F49',
  'not-urgent-important': '#7A5040',
  'urgent-not-important': '#4E5868',
  'not-urgent-not-important': '#6B4252',
};

const quadrantRank = (id: QuadrantId) => QUADRANTS.findIndex((quadrant) => quadrant.id === id);

/**
 * Mirrors the task list into the three home-screen widgets (iOS only). Runs whenever tasks,
 * the date, the language or the deadline-escalation setting change.
 */
export function useWidgetSync() {
  const { tasks, isLoaded } = useTasksContext();
  const { escalationDays } = useEscalationSettings();
  const { t, locale } = useLocale();
  const today = useToday();

  useEffect(() => {
    if (Platform.OS !== 'ios' || !isLoaded) return;

    const withQuadrant = tasks.map((task) => ({ task, quadrantId: effectiveQuadrantId(task, escalationDays, today) }));
    const byPriority = (a: (typeof withQuadrant)[number], b: (typeof withQuadrant)[number]) =>
      quadrantRank(a.quadrantId) - quadrantRank(b.quadrantId) ||
      (a.task.dueDate ?? '9999').localeCompare(b.task.dueDate ?? '9999') ||
      b.task.createdAt - a.task.createdAt;

    // Today = due today or overdue (done tasks only while still due today, so the progress adds up).
    const dueToday = withQuadrant
      .filter(({ task }) => task.dueDate !== null && (task.done ? task.dueDate === today : task.dueDate <= today))
      .sort(byPriority);
    const doneToday = dueToday.filter(({ task }) => task.done).length;
    const open = withQuadrant.filter(({ task }) => !task.done).sort(byPriority);

    TodayWidget.updateSnapshot({
      heading: t('calendar.today'),
      progress: dueToday.length ? `${doneToday}/${dueToday.length}` : '',
      empty: t('widget.empty'),
      rows: [...dueToday.filter(({ task }) => !task.done), ...dueToday.filter(({ task }) => task.done)]
        .slice(0, 3)
        .map(({ task, quadrantId }) => ({
          id: task.id,
          title: task.title,
          time: task.remindTime ?? '',
          color: DOT_COLORS[quadrantId],
          done: task.done,
        })),
    });

    const next = open[0];
    NextWidget.updateSnapshot({
      label: t('widget.now'),
      title: next ? next.task.title : t('widget.allDone'),
      due: next?.task.dueDate ? formatDueDate(next.task.dueDate, t, locale, today) : t('widget.noDeadline'),
      color: next ? DOT_COLORS[next.quadrantId] : '#2FB8B0',
      done: doneToday,
      total: dueToday.length,
    });

    MatrixWidget.updateSnapshot({
      cells: QUADRANTS.map((quadrant) => ({
        label: t(quadrant.titleKey),
        count: open.filter(({ quadrantId }) => quadrantId === quadrant.id).length,
        color: CELL_COLORS[quadrant.id],
      })),
    });
  }, [tasks, isLoaded, escalationDays, t, locale, today]);
}

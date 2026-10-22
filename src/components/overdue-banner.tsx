import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { GlassPanel } from '@/components/glass-panel';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useLocale } from '@/context/locale-context';
import { useTheme } from '@/hooks/use-theme';
import { hexToRgba } from '@/utils/colors';
import { daysOverdue } from '@/utils/overdue';
import type { Task } from '@/types/task';

const MAX_LISTED = 5;

type Props = {
  /** Open tasks past their due date, longest overdue first. */
  tasks: Task[];
  today: string;
  onDone: (task: Task) => void;
  onMoveToToday: (task: Task) => void;
  onDelete: (task: Task) => void;
  onOpen: (task: Task) => void;
};

/** A collapsed "Overdue: N" line above the list that expands into the tasks, each with quick actions. */
export function OverdueBanner({ tasks, today, onDone, onMoveToToday, onDelete, onOpen }: Props) {
  const { t } = useLocale();
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);

  if (tasks.length === 0) return null;

  const listed = tasks.slice(0, MAX_LISTED);
  const actions = (task: Task) =>
    [
      { label: t('overdue.done'), color: theme.primary, onPress: () => onDone(task) },
      { label: t('overdue.today'), color: theme.text, onPress: () => onMoveToToday(task) },
      { label: t('overdue.delete'), color: theme.danger, onPress: () => onDelete(task) },
    ] as const;

  return (
    <GlassPanel style={styles.banner} contentStyle={styles.content} tintColor={hexToRgba(theme.danger, 0.15)}>
      <Pressable
        onPress={() => setExpanded((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={styles.header}>
        <ThemedText type="smallBold" style={styles.headerText}>
          ⚠️ {t('overdue.title', { count: tasks.length })}
        </ThemedText>
        <ThemedText themeColor="textSecondary">{expanded ? '▴' : '▾'}</ThemedText>
      </Pressable>

      {expanded && (
        <View style={styles.list}>
          {listed.map((task) => (
            <View key={task.id} style={styles.item}>
              <Pressable onPress={() => onOpen(task)} accessibilityRole="button">
                <ThemedText numberOfLines={1}>{task.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('overdue.daysAgo', { count: daysOverdue(task, today) })}
                </ThemedText>
              </Pressable>
              <View style={styles.actions}>
                {actions(task).map((action) => (
                  <Pressable
                    key={action.label}
                    onPress={action.onPress}
                    hitSlop={6}
                    accessibilityRole="button"
                    style={[styles.action, { borderColor: theme.glassBorder, backgroundColor: theme.glassBg }]}>
                    <ThemedText type="small" style={{ color: action.color }}>
                      {action.label}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
          {tasks.length > MAX_LISTED && (
            <ThemedText type="small" themeColor="textSecondary">
              {t('overdue.more', { count: tasks.length - MAX_LISTED })}
            </ThemedText>
          )}
        </View>
      )}
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginBottom: Spacing.three,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  headerText: {
    flex: 1,
  },
  list: {
    gap: Spacing.three,
  },
  item: {
    gap: Spacing.two,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  action: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 999,
    borderWidth: 1,
  },
});

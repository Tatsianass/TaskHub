import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { QUADRANTS } from '@/constants/quadrants';
import { TAGS } from '@/constants/tags';
import { Spacing } from '@/constants/theme';
import { useLocale } from '@/context/locale-context';
import { useToday } from '@/context/today-context';
import { useTheme } from '@/hooks/use-theme';
import { hexToRgba } from '@/utils/colors';
import { formatDueDate } from '@/utils/dates';
import type { Task } from '@/types/task';

type Props = {
  task: Task;
  accentColor: string;
  /** Shown in an urgent quadrant because its deadline is close; the row says where it came from. */
  escalated?: boolean;
  /** Just arrived in this quadrant and not seen yet: highlighted with a "New" chip. */
  isNew?: boolean;
  onToggle: () => void;
  onPress: () => void;
};

export function TaskRow({ task, accentColor, escalated, isNew, onToggle, onPress }: Props) {
  const { t, locale } = useLocale();
  const today = useToday();
  const theme = useTheme();
  // The stored quadrant is where an escalated task came from.
  const origin = escalated ? QUADRANTS.find((quadrant) => quadrant.id === task.quadrantId) : undefined;
  const tag = TAGS.find((candidate) => candidate.id === task.tag);

  return (
    <View
      style={[
        styles.row,
        isNew && { backgroundColor: hexToRgba(theme.primary, 0.14), borderColor: hexToRgba(theme.primary, 0.45) },
      ]}>
      <Pressable
        onPress={onToggle}
        hitSlop={8}
        style={[styles.checkbox, { borderColor: accentColor }, task.done && { backgroundColor: accentColor }]}
      />
      <Pressable style={styles.body} onPress={onPress} hitSlop={4}>
        <View style={styles.titleRow}>
          <ThemedText style={[styles.title, task.done && styles.done]} numberOfLines={1}>
            {task.title}
          </ThemedText>
          {isNew && (
            <View style={[styles.newChip, { backgroundColor: theme.primary }]}>
              <ThemedText style={[styles.newChipText, { color: theme.background }]}>{t('escalation.new')}</ThemedText>
            </View>
          )}
        </View>
        {!!task.description && (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {task.description}
          </ThemedText>
        )}
        {!!tag && (
          <ThemedText type="small" themeColor="textSecondary">
            {tag.icon} {t(tag.labelKey)}
          </ThemedText>
        )}
        {!!task.dueDate && (
          <ThemedText type="small" style={[styles.due, { color: accentColor }]}>
            {formatDueDate(task.dueDate, t, locale, today)}
          </ThemedText>
        )}
        {!!origin && (
          <ThemedText type="small" themeColor="textSecondary">
            {t('escalation.movedFrom', { from: t(origin.shortLabelKey) })}
          </ThemedText>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    marginVertical: 2,
    borderRadius: Spacing.three,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  title: {
    flexShrink: 1,
    fontSize: 15,
  },
  newChip: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  newChipText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  done: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  due: {
    fontWeight: '700',
  },
});

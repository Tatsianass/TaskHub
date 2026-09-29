import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { TAGS } from '@/constants/tags';
import { Spacing } from '@/constants/theme';
import { useLocale } from '@/context/locale-context';
import { useToday } from '@/context/today-context';
import { formatDueDate } from '@/utils/dates';
import type { Task } from '@/types/task';

type Props = {
  task: Task;
  accentColor: string;
  escalated?: boolean;
  onToggle: () => void;
  onPress: () => void;
};

export function TaskRow({ task, accentColor, escalated, onToggle, onPress }: Props) {
  const { t, locale } = useLocale();
  const today = useToday();
  const tag = TAGS.find((candidate) => candidate.id === task.tag);

  return (
    <View style={styles.row}>
      <Pressable
        onPress={onToggle}
        hitSlop={8}
        style={[styles.checkbox, { borderColor: accentColor }, task.done && { backgroundColor: accentColor }]}
      />
      <Pressable style={styles.body} onPress={onPress} hitSlop={4}>
        <ThemedText style={[styles.title, task.done && styles.done]} numberOfLines={1}>
          {task.title}
        </ThemedText>
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
            {escalated ? '🔥 ' : ''}
            {formatDueDate(task.dueDate, t, locale, today)}
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
  title: {
    fontSize: 15,
  },
  done: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  due: {
    fontWeight: '700',
  },
});

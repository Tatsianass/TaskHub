import { Redirect, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuroraBackground } from '@/components/aurora-background';
import { GlassPanel } from '@/components/glass-panel';
import { ThemedText } from '@/components/themed-text';
import { QUADRANTS } from '@/constants/quadrants';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useLocale } from '@/context/locale-context';
import { useTasksContext } from '@/context/tasks-context';
import { useToday } from '@/context/today-context';
import { useTheme } from '@/hooks/use-theme';
import type { Task } from '@/types/task';
import { dayDiffFromToday, isoDateOf } from '@/utils/dates';

type GroupId = 'today' | 'yesterday' | 'thisWeek' | 'earlier';

const GROUPS: { id: GroupId; titleKey: string }[] = [
  { id: 'today', titleKey: 'completed.today' },
  { id: 'yesterday', titleKey: 'completed.yesterday' },
  { id: 'thisWeek', titleKey: 'completed.thisWeek' },
  { id: 'earlier', titleKey: 'completed.earlier' },
];

/** Older tasks stay behind "Show more" so a long history doesn't bury today. */
const EARLIER_PREVIEW = 5;
const ACTIONS_WIDTH = 144;

function groupOf(task: Task, today: string): GroupId {
  // Tasks finished before completion times were tracked have no date: they count as earlier.
  if (task.completedAt === null) return 'earlier';
  const diff = dayDiffFromToday(isoDateOf(task.completedAt), today);
  if (diff >= 0) return 'today';
  if (diff === -1) return 'yesterday';
  if (diff >= -6) return 'thisWeek';
  return 'earlier';
}

export default function CompletedScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t, locale } = useLocale();
  const theme = useTheme();
  const today = useToday();
  const { tasks, toggleTask, deleteTask, clearCompleted } = useTasksContext();
  const [showAllEarlier, setShowAllEarlier] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const completed = useMemo(
    () => tasks.filter((task) => task.done).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)),
    [tasks],
  );
  const groups = useMemo(
    () =>
      GROUPS.map((group) => ({ ...group, tasks: completed.filter((task) => groupOf(task, today) === group.id) })).filter(
        (group) => group.tasks.length > 0,
      ),
    [completed, today],
  );

  if (!user) return <Redirect href="/login" />;

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const describe = (task: Task) => {
    const quadrant = QUADRANTS.find((candidate) => candidate.id === task.quadrantId);
    const label = quadrant ? t(quadrant.shortLabelKey) : '';
    if (task.completedAt === null) return label;
    const when = new Date(task.completedAt);
    const group = groupOf(task, today);
    const stamp =
      group === 'today' || group === 'yesterday'
        ? new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(when)
        : new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(when);
    return `${label} · ${stamp}`;
  };

  const confirmClear = () => {
    clearCompleted();
    setConfirmingClear(false);
  };

  return (
    <AuroraBackground>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Pressable
              onPress={goBack}
              hitSlop={10}
              style={styles.back}
              accessibilityRole="button"
              accessibilityLabel={t('completed.back')}>
              <ThemedText style={[styles.chevron, { color: theme.primary }]}>‹</ThemedText>
              <ThemedText type="subtitle" style={styles.title}>
                {t('completed.title')}
              </ThemedText>
            </Pressable>
            {completed.length > 0 && (
              <Pressable onPress={() => setConfirmingClear(true)} hitSlop={10} accessibilityRole="button">
                <ThemedText style={{ color: theme.danger }}>{t('completed.clear')}</ThemedText>
              </Pressable>
            )}
          </View>
          {completed.length > 0 && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.summary}>
              {t('completed.count', { count: completed.length })}
            </ThemedText>
          )}

          {completed.length === 0 ? (
            <View style={styles.empty}>
              <ThemedText style={styles.emptyIcon}>✅</ThemedText>
              <ThemedText type="smallBold">{t('completed.empty')}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.emptyHint}>
                {t('completed.emptyHint')}
              </ThemedText>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
              {groups.map((group) => {
                const collapsible = group.id === 'earlier' && group.tasks.length > EARLIER_PREVIEW;
                const visible = collapsible && !showAllEarlier ? group.tasks.slice(0, EARLIER_PREVIEW) : group.tasks;
                return (
                  <View key={group.id}>
                    <View style={styles.groupHeader}>
                      <ThemedText type="small" themeColor="textSecondary">
                        {t(group.titleKey)}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {group.tasks.length}
                      </ThemedText>
                    </View>
                    <GlassPanel>
                      {visible.map((task, index) => (
                        <CompletedRow
                          key={task.id}
                          task={task}
                          subtitle={describe(task)}
                          first={index === 0}
                          onRestore={() => toggleTask(task.id)}
                          onDelete={() => deleteTask(task.id)}
                        />
                      ))}
                    </GlassPanel>
                    {collapsible && (
                      <Pressable onPress={() => setShowAllEarlier((value) => !value)} style={styles.more}>
                        <ThemedText type="small" themeColor="textSecondary">
                          {showAllEarlier
                            ? t('completed.hideEarlier')
                            : t('completed.showEarlier', { count: group.tasks.length - EARLIER_PREVIEW })}
                        </ThemedText>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </SafeAreaView>

      <Modal visible={confirmingClear} transparent animationType="fade" onRequestClose={() => setConfirmingClear(false)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setConfirmingClear(false)} />
          <GlassPanel style={styles.dialog} tintColor={theme.background} contentStyle={styles.dialogContent}>
            <ThemedText type="subtitle" style={styles.dialogTitle}>
              {t('completed.clearTitle')}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.dialogBody}>
              {t('completed.clearBody', { count: completed.length })}
            </ThemedText>
            <Pressable
              onPress={confirmClear}
              style={[styles.dialogButton, { backgroundColor: theme.danger }]}
              accessibilityRole="button">
              <ThemedText style={{ color: theme.background, fontWeight: '700' }}>
                {t('completed.clearConfirm', { count: completed.length })}
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => setConfirmingClear(false)}
              style={[styles.dialogButton, { backgroundColor: theme.backgroundElement }]}
              accessibilityRole="button">
              <ThemedText>{t('completed.cancel')}</ThemedText>
            </Pressable>
          </GlassPanel>
        </View>
      </Modal>
    </AuroraBackground>
  );
}

type RowProps = {
  task: Task;
  subtitle: string;
  first: boolean;
  onRestore: () => void;
  onDelete: () => void;
};

function CompletedRow({ task, subtitle, first, onRestore, onDelete }: RowProps) {
  const { t } = useLocale();
  const theme = useTheme();
  const color = QUADRANTS.find((quadrant) => quadrant.id === task.quadrantId)?.color ?? theme.primary;

  const renderActions = () => (
    <View style={styles.actions}>
      <Pressable
        onPress={onRestore}
        style={[styles.action, { backgroundColor: theme.text }]}
        accessibilityRole="button"
        accessibilityLabel={t('completed.restore')}>
        <ThemedText style={[styles.actionIcon, { color: theme.background }]}>↩</ThemedText>
        <ThemedText style={[styles.actionText, { color: theme.background }]}>{t('completed.restore')}</ThemedText>
      </Pressable>
      <Pressable
        onPress={onDelete}
        style={[styles.action, { backgroundColor: theme.danger }]}
        accessibilityRole="button"
        accessibilityLabel={t('completed.delete')}>
        <ThemedText style={[styles.actionIcon, { color: theme.background }]}>🗑</ThemedText>
        <ThemedText style={[styles.actionText, { color: theme.background }]}>{t('completed.delete')}</ThemedText>
      </Pressable>
    </View>
  );

  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={renderActions}
      containerStyle={!first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.glassBorder }}>
      <View style={[styles.row, { backgroundColor: theme.background }]}>
        <View style={[styles.check, { backgroundColor: color }]}>
          <ThemedText style={[styles.checkMark, { color: theme.background }]}>✓</ThemedText>
        </View>
        <View style={styles.rowBody}>
          <ThemedText style={styles.rowTitle} numberOfLines={1}>
            {task.title}
          </ThemedText>
          {!!subtitle && (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {subtitle}
            </ThemedText>
          )}
        </View>
      </View>
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.two },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  chevron: { fontSize: 34, lineHeight: 38 },
  title: { fontSize: 24 },
  summary: { marginLeft: Spacing.four, marginBottom: Spacing.two },
  scroll: { paddingBottom: Spacing.five },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.three,
    marginBottom: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  more: { alignItems: 'center', paddingVertical: Spacing.three },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  check: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  checkMark: { fontSize: 13, lineHeight: 16, fontWeight: '700' },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, textDecorationLine: 'line-through', opacity: 0.6 },
  actions: { width: ACTIONS_WIDTH, flexDirection: 'row' },
  action: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  actionIcon: { fontSize: 18, lineHeight: 22 },
  actionText: { fontSize: 11, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  emptyIcon: { fontSize: 40, lineHeight: 52 },
  emptyHint: { textAlign: 'center' },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  dialog: { width: '100%', maxWidth: 340 },
  dialogContent: { padding: Spacing.four, gap: Spacing.two },
  dialogTitle: { fontSize: 20, textAlign: 'center' },
  dialogBody: { textAlign: 'center', marginBottom: Spacing.two },
  dialogButton: { alignItems: 'center', paddingVertical: Spacing.three, borderRadius: Spacing.three },
});

import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DateField } from '@/components/date-field';
import { PrimaryButton } from '@/components/primary-button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MAX_ACTIVE_TASKS_PER_QUADRANT, QUADRANTS } from '@/constants/quadrants';
import { Spacing } from '@/constants/theme';
import { useLocale } from '@/context/locale-context';
import { useTheme } from '@/hooks/use-theme';
import { parseSmartDate, suggestQuadrant } from '@/utils/smart-task';
import { hexToRgba } from '@/utils/colors';
import type { TaskDraft } from '@/hooks/use-tasks';
import type { QuadrantId, Task } from '@/types/task';

type Props = {
  visible: boolean;
  initialTask: Task | null;
  defaultQuadrantId: QuadrantId;
  tasks: Task[];
  onClose: () => void;
  onSave: (draft: TaskDraft) => void;
  onDelete?: () => void;
  onToggleTask: (id: string) => void;
};

export function TaskFormModal({
  visible,
  initialTask,
  defaultQuadrantId,
  tasks,
  onClose,
  onSave,
  onDelete,
  onToggleTask,
}: Props) {
  const { t, locale } = useLocale();
  const theme = useTheme();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [quadrantId, setQuadrantId] = useState<QuadrantId>(defaultQuadrantId);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [dueDateAuto, setDueDateAuto] = useState(false);
  const [quadrantTouched, setQuadrantTouched] = useState(false);
  const [suggestedQuadrantId, setSuggestedQuadrantId] = useState<QuadrantId | null>(null);
  const [forceAdd, setForceAdd] = useState(false);
  const justResetRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    justResetRef.current = true;
    setTitle(initialTask?.title ?? '');
    setDescription(initialTask?.description ?? '');
    setQuadrantId(initialTask?.quadrantId ?? defaultQuadrantId);
    setDueDate(initialTask?.dueDate ?? null);
    setDueDateAuto(false);
    setQuadrantTouched(!!initialTask);
    setSuggestedQuadrantId(null);
    setForceAdd(false);
  }, [visible, initialTask, defaultQuadrantId]);

  useEffect(() => {
    setForceAdd(false);
  }, [quadrantId]);

  // Smart date + quadrant suggestion from the title text — only while creating a new task.
  useEffect(() => {
    if (!visible || initialTask) return;
    if (justResetRef.current) {
      // Skip the pass that still holds the previous session's stale title (reset above hasn't
      // committed yet); the effect re-runs once `title` actually reflects the reset value.
      justResetRef.current = false;
      return;
    }
    const trimmed = title.trim();
    if (!trimmed) {
      setSuggestedQuadrantId(null);
      return;
    }

    const parsedDate = parseSmartDate(trimmed, locale);
    if (parsedDate && (dueDate === null || dueDateAuto)) {
      setDueDate(parsedDate);
      setDueDateAuto(true);
    } else if (!parsedDate && dueDateAuto) {
      setDueDate(null);
      setDueDateAuto(false);
    }

    const suggestion = suggestQuadrant(trimmed, locale);
    setSuggestedQuadrantId(suggestion);
    if (suggestion && !quadrantTouched) {
      setQuadrantId(suggestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, locale, initialTask, visible]);

  const activeTasksInQuadrant = tasks.filter(
    (task) => task.quadrantId === quadrantId && !task.done && task.id !== initialTask?.id,
  );
  const isOverLimit = activeTasksInQuadrant.length >= MAX_ACTIVE_TASKS_PER_QUADRANT;
  const canSave = !!title.trim() && (!isOverLimit || forceAdd);

  const handleSave = () => {
    if (!canSave) return;
    onSave({ title, description, quadrantId, dueDate });
  };

  const dateHint =
    dueDateAuto && dueDate
      ? t('taskForm.autoDateHint', {
          date: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(new Date(`${dueDate}T00:00:00`)),
        })
      : null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ThemedView style={styles.sheet}>
          <SafeAreaView edges={['bottom']}>
            <View style={styles.header}>
              <ThemedText type="smallBold">{initialTask ? t('taskForm.editTitle') : t('taskForm.addTitle')}</ThemedText>
              <View style={styles.headerActions}>
                {onDelete && (
                  <Pressable onPress={onDelete} hitSlop={8}>
                    <ThemedText style={styles.deleteIcon}>🗑</ThemedText>
                  </Pressable>
                )}
                <Pressable onPress={onClose} hitSlop={8}>
                  <ThemedText style={styles.closeIcon}>✕</ThemedText>
                </Pressable>
              </View>
            </View>

            <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
              <TextField
                label={t('taskForm.titleLabel')}
                value={title}
                onChangeText={setTitle}
                placeholder={t('taskForm.titlePlaceholder')}
                autoFocus
              />
              <TextField
                label={t('taskForm.descriptionLabel')}
                value={description}
                onChangeText={setDescription}
                placeholder={t('taskForm.descriptionPlaceholder')}
                multiline
                numberOfLines={3}
                style={styles.multiline}
              />

              <DateField
                label={t('taskForm.dateLabel')}
                placeholder={t('taskForm.datePlaceholder')}
                value={dueDate}
                onChange={(value) => {
                  setDueDate(value);
                  setDueDateAuto(false);
                }}
              />
              {!!dateHint && (
                <ThemedText type="small" themeColor="primary" style={styles.hint}>
                  {dateHint}
                </ThemedText>
              )}

              <ThemedText type="small" themeColor="textSecondary" style={styles.quadrantLabel}>
                {t('taskForm.sectionLabel')}
              </ThemedText>
              <View style={[styles.quadrantTabs, { backgroundColor: theme.glassBg, borderColor: theme.glassBorder }]}>
                {QUADRANTS.map((quadrant) => {
                  const isActive = quadrant.id === quadrantId;
                  return (
                    <Pressable
                      key={quadrant.id}
                      style={styles.quadrantTabWrapper}
                      onPress={() => {
                        setQuadrantId(quadrant.id);
                        setQuadrantTouched(true);
                      }}>
                      <View
                        style={[
                          styles.quadrantTab,
                          isActive && {
                            backgroundColor: hexToRgba(quadrant.color, 0.32),
                            borderColor: theme.glassBorder,
                          },
                        ]}>
                        <ThemedText style={styles.quadrantTabIcon}>{quadrant.icon}</ThemedText>
                        <ThemedText type="small" themeColor={isActive ? 'text' : 'textSecondary'}>
                          {t(quadrant.shortLabelKey)}
                        </ThemedText>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              {!!suggestedQuadrantId && !quadrantTouched && (
                <ThemedText type="small" themeColor="primary" style={styles.hint}>
                  {t('taskForm.autoQuadrantHint')}
                </ThemedText>
              )}

              {isOverLimit && !forceAdd && (
                <View
                  style={[
                    styles.swapPanel,
                    { backgroundColor: hexToRgba(theme.danger, 0.12), borderColor: hexToRgba(theme.danger, 0.3) },
                  ]}>
                  <ThemedText type="smallBold">
                    {t('taskForm.swapTitle', { count: activeTasksInQuadrant.length })}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('taskForm.swapSubtitle')}
                  </ThemedText>
                  {activeTasksInQuadrant.map((task) => (
                    <Pressable key={task.id} style={styles.swapRow} onPress={() => onToggleTask(task.id)}>
                      <View style={[styles.swapCheckbox, { borderColor: theme.border }]} />
                      <ThemedText type="small" numberOfLines={1} style={styles.swapRowText}>
                        {task.title}
                      </ThemedText>
                    </Pressable>
                  ))}
                  <Pressable onPress={() => setForceAdd(true)} hitSlop={8} style={styles.swapForce}>
                    <ThemedText type="small" themeColor="primary">
                      {t('taskForm.swapForceAdd')}
                    </ThemedText>
                  </Pressable>
                </View>
              )}

              <PrimaryButton title={t('taskForm.save')} onPress={handleSave} disabled={!canSave} />
            </ScrollView>
          </SafeAreaView>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20,22,28,0.25)',
  },
  sheet: {
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    maxHeight: '88%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  deleteIcon: {
    fontSize: 18,
  },
  closeIcon: {
    fontSize: 18,
  },
  form: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  hint: {
    marginTop: -Spacing.two,
  },
  quadrantLabel: {
    marginTop: Spacing.one,
  },
  quadrantTabs: {
    flexDirection: 'row',
    gap: Spacing.one,
    padding: Spacing.one,
    borderRadius: Spacing.two,
    borderWidth: 1,
  },
  quadrantTabWrapper: {
    flex: 1,
  },
  quadrantTab: {
    alignItems: 'center',
    gap: 3,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  quadrantTabIcon: {
    fontSize: 17,
  },
  swapPanel: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  swapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  swapCheckbox: {
    width: 16,
    height: 16,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  swapRowText: {
    flex: 1,
  },
  swapForce: {
    alignSelf: 'flex-start',
    marginTop: Spacing.one,
  },
});

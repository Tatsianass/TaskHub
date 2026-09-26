import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CustomDatePill } from '@/components/custom-date-pill';
import { PrimaryButton } from '@/components/primary-button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MAX_ACTIVE_TASKS_PER_QUADRANT } from '@/constants/quadrants';
import { TAGS } from '@/constants/tags';
import { Spacing } from '@/constants/theme';
import { useLocale } from '@/context/locale-context';
import { useTheme } from '@/hooks/use-theme';
import { hexToRgba } from '@/utils/colors';
import { dayDiffFromToday } from '@/utils/dates';
import { parseSmartDate, suggestImportance } from '@/utils/smart-task';
import type { TaskDraft } from '@/hooks/use-tasks';
import type { QuadrantId, TagId, Task } from '@/types/task';

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

type WhenOption = 'today' | 'tomorrow' | 'week' | 'custom';

function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function dateForWhen(when: WhenOption): string | null {
  if (when === 'today') return toISODate(new Date());
  if (when === 'tomorrow') return toISODate(addDays(new Date(), 1));
  if (when === 'week') return toISODate(addDays(new Date(), 7));
  return null;
}

/** Buckets a stored date back into one of the quick-pick pills, for highlighting. */
function inferWhenOption(dueDate: string | null): WhenOption | null {
  if (!dueDate) return null;
  const diff = dayDiffFromToday(dueDate);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff >= 2 && diff <= 7) return 'week';
  return 'custom';
}

function isUrgentDate(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return dayDiffFromToday(dueDate) <= 1;
}

function isImportantQuadrant(id: QuadrantId): boolean {
  return id === 'urgent-important' || id === 'not-urgent-important';
}

function computeQuadrant(important: boolean, urgent: boolean): QuadrantId {
  if (important && urgent) return 'urgent-important';
  if (important) return 'not-urgent-important';
  if (urgent) return 'urgent-not-important';
  return 'not-urgent-not-important';
}

const WHEN_OPTIONS: { id: Exclude<WhenOption, 'custom'>; labelKey: string }[] = [
  { id: 'today', labelKey: 'taskForm.when.today' },
  { id: 'tomorrow', labelKey: 'taskForm.when.tomorrow' },
  { id: 'week', labelKey: 'taskForm.when.week' },
];

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
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [dueDateAuto, setDueDateAuto] = useState(false);
  const [isImportant, setIsImportant] = useState(true);
  const [importantTouched, setImportantTouched] = useState(false);
  const [tag, setTag] = useState<TagId | null>(null);
  const [remindMe, setRemindMe] = useState(false);
  const [forceAdd, setForceAdd] = useState(false);
  const justResetRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    justResetRef.current = true;
    setTitle(initialTask?.title ?? '');
    setDescription(initialTask?.description ?? '');
    setDueDate(initialTask ? initialTask.dueDate : dateForWhen('today'));
    setDueDateAuto(false);
    setIsImportant(initialTask ? isImportantQuadrant(initialTask.quadrantId) : true);
    setImportantTouched(!!initialTask);
    setTag(initialTask?.tag ?? null);
    setRemindMe(initialTask?.remindMe ?? false);
    setForceAdd(false);
  }, [visible, initialTask, defaultQuadrantId]);

  // Smart date + importance suggestion from the title text — only while creating a new task.
  useEffect(() => {
    if (!visible || initialTask) return;
    if (justResetRef.current) {
      // Skip the pass that still holds the previous session's stale title (reset above hasn't
      // committed yet); the effect re-runs once `title` actually reflects the reset value.
      justResetRef.current = false;
      return;
    }
    const trimmed = title.trim();
    if (!trimmed) return;

    const parsedDate = parseSmartDate(trimmed, locale);
    if (parsedDate && (dueDate === null || dueDateAuto)) {
      setDueDate(parsedDate);
      setDueDateAuto(true);
    } else if (!parsedDate && dueDateAuto) {
      setDueDate(null);
      setDueDateAuto(false);
    }

    const importance = suggestImportance(trimmed, locale);
    if (importance !== null && !importantTouched) {
      setIsImportant(importance);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, locale, initialTask, visible]);

  const whenOption = inferWhenOption(dueDate);
  const urgent = isUrgentDate(dueDate);
  const quadrantId = computeQuadrant(isImportant, urgent);

  const activeTasksInQuadrant = tasks.filter(
    (task) => task.quadrantId === quadrantId && !task.done && task.id !== initialTask?.id,
  );
  const isOverLimit = activeTasksInQuadrant.length >= MAX_ACTIVE_TASKS_PER_QUADRANT;
  const canSave = !!title.trim() && (!isOverLimit || forceAdd);

  const handleSave = () => {
    if (!canSave) return;
    onSave({ title, description, quadrantId, tag, dueDate, remindMe });
  };

  const handleWhenPress = (option: Exclude<WhenOption, 'custom'>) => {
    setDueDate(dateForWhen(option));
    setDueDateAuto(false);
    setForceAdd(false);
  };

  const handleCustomDate = (value: string) => {
    setDueDate(value);
    setDueDateAuto(false);
    setForceAdd(false);
  };

  const dateHint =
    dueDateAuto && dueDate
      ? t('taskForm.autoDateHint', {
          date: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(new Date(`${dueDate}T00:00:00`)),
        })
      : null;

  const customDateLabel =
    whenOption === 'custom' && dueDate
      ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(`${dueDate}T00:00:00`))
      : t('taskForm.when.custom');

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ThemedView style={styles.sheet}>
          <SafeAreaView edges={['bottom']}>
            <View style={styles.header}>
              <Pressable
                onPress={onClose}
                hitSlop={8}
                style={[styles.iconButton, { borderColor: theme.glassBorder, backgroundColor: theme.glassBg }]}>
                <ThemedText style={styles.closeIcon}>✕</ThemedText>
              </Pressable>
              <ThemedText type="smallBold" style={styles.headerTitle}>
                {initialTask ? t('taskForm.editTitle') : t('taskForm.addTitle')}
              </ThemedText>
              {onDelete ? (
                <Pressable
                  onPress={onDelete}
                  hitSlop={8}
                  style={[styles.iconButton, { borderColor: theme.glassBorder, backgroundColor: theme.glassBg }]}>
                  <ThemedText style={styles.deleteIcon}>🗑</ThemedText>
                </Pressable>
              ) : (
                <View style={styles.iconButton} />
              )}
            </View>

            <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
              <TextField value={title} onChangeText={setTitle} placeholder={t('taskForm.titlePlaceholder')} autoFocus />
              <TextField
                label={t('taskForm.descriptionLabel')}
                value={description}
                onChangeText={setDescription}
              />

              <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
                {t('taskForm.whenLabel')}
              </ThemedText>
              <View style={styles.pillRow}>
                {WHEN_OPTIONS.map((option) => (
                  <Pressable key={option.id} onPress={() => handleWhenPress(option.id)}>
                    <View
                      style={[
                        styles.pill,
                        { borderColor: theme.glassBorder, backgroundColor: theme.glassBg },
                        whenOption === option.id && { backgroundColor: theme.backgroundSelected },
                      ]}>
                      <ThemedText type="small" themeColor={whenOption === option.id ? 'text' : 'textSecondary'}>
                        {t(option.labelKey)}
                      </ThemedText>
                    </View>
                  </Pressable>
                ))}
                <CustomDatePill active={whenOption === 'custom'} label={customDateLabel} icon="📅" onChange={handleCustomDate} />
              </View>
              {!!dateHint && (
                <ThemedText type="small" themeColor="primary" style={styles.hint}>
                  {dateHint}
                </ThemedText>
              )}

              <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
                {t('taskForm.importanceLabel')}
              </ThemedText>
              <View style={[styles.segmented, { borderColor: theme.glassBorder, backgroundColor: theme.glassBg }]}>
                <Pressable
                  style={styles.segmentWrapper}
                  onPress={() => {
                    setIsImportant(false);
                    setImportantTouched(true);
                  }}>
                  <View style={[styles.segment, !isImportant && { backgroundColor: theme.backgroundSelected }]}>
                    <ThemedText type="smallBold" themeColor={!isImportant ? 'text' : 'textSecondary'}>
                      {t('taskForm.importanceLow')}
                    </ThemedText>
                  </View>
                </Pressable>
                <Pressable
                  style={styles.segmentWrapper}
                  onPress={() => {
                    setIsImportant(true);
                    setImportantTouched(true);
                  }}>
                  <View style={[styles.segment, isImportant && { backgroundColor: theme.backgroundSelected }]}>
                    <ThemedText type="smallBold" themeColor={isImportant ? 'text' : 'textSecondary'}>
                      {t('taskForm.importanceHigh')}
                    </ThemedText>
                  </View>
                </Pressable>
              </View>
              <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                {t('taskForm.importanceHint')}
              </ThemedText>

              <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
                {t('taskForm.tagLabel')}
              </ThemedText>
              <View style={styles.categoryRow}>
                {TAGS.map((tagOption) => {
                  const isActive = tag === tagOption.id;
                  return (
                    <Pressable key={tagOption.id} style={styles.categoryItem} onPress={() => setTag(tagOption.id)}>
                      <View
                        style={[
                          styles.pill,
                          styles.categoryPill,
                          { borderColor: theme.glassBorder, backgroundColor: theme.glassBg },
                          isActive && { backgroundColor: theme.backgroundSelected },
                        ]}>
                        <ThemedText style={styles.pillIcon}>{tagOption.icon}</ThemedText>
                        <ThemedText type="small" themeColor={isActive ? 'text' : 'textSecondary'}>
                          {t(tagOption.labelKey)}
                        </ThemedText>
                      </View>
                    </Pressable>
                  );
                })}
                <Pressable style={styles.categoryItem} onPress={() => setTag(null)}>
                  <View
                    style={[
                      styles.pill,
                      styles.categoryPill,
                      { borderColor: theme.glassBorder, backgroundColor: theme.glassBg },
                      tag === null && { backgroundColor: theme.backgroundSelected },
                    ]}>
                    <ThemedText type="small" themeColor={tag === null ? 'text' : 'textSecondary'}>
                      {t('tag.none')}
                    </ThemedText>
                  </View>
                </Pressable>
              </View>

              <View style={[styles.divider, { backgroundColor: theme.glassBorder }]} />

              <View style={styles.remindRow}>
                <ThemedText>🔔 {t('taskForm.remindLabel')}</ThemedText>
                <Switch
                  value={remindMe}
                  onValueChange={setRemindMe}
                  trackColor={{ false: theme.glassBorder, true: theme.primary }}
                />
              </View>

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

              <PrimaryButton
                title={initialTask ? t('taskForm.save') : t('taskForm.addButton')}
                onPress={handleSave}
                disabled={!canSave}
              />
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
  headerTitle: {
    flex: 1,
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
  deleteIcon: {
    fontSize: 15,
  },
  closeIcon: {
    fontSize: 15,
  },
  form: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  hint: {
    marginTop: -Spacing.two,
  },
  sectionLabel: {
    marginTop: Spacing.one,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillIcon: {
    fontSize: 14,
  },
  categoryRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  categoryItem: {
    flex: 1,
  },
  categoryPill: {
    justifyContent: 'center',
  },
  segmented: {
    flexDirection: 'row',
    gap: Spacing.one,
    padding: Spacing.one,
    borderRadius: Spacing.two,
    borderWidth: 1,
  },
  segmentWrapper: {
    flex: 1,
  },
  segment: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
  divider: {
    height: 1,
  },
  remindRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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

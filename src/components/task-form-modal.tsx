import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomSheetModal } from '@/components/bottom-sheet-modal';
import { CustomDatePill } from '@/components/custom-date-pill';
import { MicIcon, TrashIcon } from '@/components/header-icons';
import { PrimaryButton } from '@/components/primary-button';
import { RemindersSection } from '@/components/reminders-section';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { MAX_ACTIVE_TASKS_PER_QUADRANT } from '@/constants/quadrants';
import { TAGS } from '@/constants/tags';
import { Spacing } from '@/constants/theme';
import { useEscalationSettings } from '@/context/escalation-context';
import { useLocale } from '@/context/locale-context';
import { useToday } from '@/context/today-context';
import { useTheme } from '@/hooks/use-theme';
import { usePro } from '@/context/pro-context';
import { useVoiceInput } from '@/hooks/use-voice-input';
import { hexToRgba } from '@/utils/colors';
import { dayDiffFromToday } from '@/utils/dates';
import { effectiveQuadrantId } from '@/utils/priority';
import { taskOffsets } from '@/utils/reminders';
import { parseSmartDate, parseSpokenTask, suggestImportance } from '@/utils/smart-task';
import type { TaskDraft } from '@/hooks/use-tasks';
import type { QuadrantId, TagId, Task } from '@/types/task';

type Props = {
  visible: boolean;
  initialTask: Task | null;
  defaultQuadrantId: QuadrantId;
  /** Due date a new task starts with (YYYY-MM-DD); defaults to today. */
  defaultDueDate?: string | null;
  /** Start listening as soon as the form opens for a new task (the home screen's mic button). */
  autoListen?: boolean;
  tasks: Task[];
  onClose: () => void;
  onSave: (draft: TaskDraft) => void;
  onDelete?: () => void;
  onToggleTask: (id: string) => void;
};

type WhenOption = 'none' | 'today' | 'tomorrow' | 'week' | 'custom';

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
function inferWhenOption(dueDate: string | null): WhenOption {
  if (!dueDate) return 'none';
  const diff = dayDiffFromToday(dueDate);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  // Only the exact date the pill sets; any other day shows up as a custom date, so it's visible.
  if (diff === 7) return 'week';
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
  { id: 'none', labelKey: 'calendar.noDate' },
];

export function TaskFormModal({
  visible,
  initialTask,
  defaultQuadrantId,
  defaultDueDate,
  autoListen = false,
  tasks,
  onClose,
  onSave,
  onDelete,
  onToggleTask,
}: Props) {
  const { t, locale } = useLocale();
  const theme = useTheme();
  const { isPro, openPaywall } = usePro();
  const { escalationDays } = useEscalationSettings();
  const today = useToday();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [dueDateAuto, setDueDateAuto] = useState(false);
  // Set once the user picks a date themselves; from then on the title text no longer changes it.
  const [dueDateManual, setDueDateManual] = useState(false);
  const [isImportant, setIsImportant] = useState(true);
  const [importantTouched, setImportantTouched] = useState(false);
  const [tag, setTag] = useState<TagId | null>(null);
  // A new task starts as all-day with one alert on the day; switching it off leaves no reminder.
  const [remindOffsets, setRemindOffsets] = useState<number[]>([0]);
  const [remindTime, setRemindTime] = useState<string | null>(null);
  const [forceAdd, setForceAdd] = useState(false);
  const justResetRef = useRef(false);
  // What was already typed when dictation started; the phrase heard so far is appended to it.
  const dictationBaseRef = useRef('');
  const voice = useVoiceInput({
    onTranscript: (text, isFinal) => {
      const base = dictationBaseRef.current;
      const join = (phrase: string) => (base ? `${base} ${phrase}` : phrase);
      if (!isFinal) {
        setTitle(join(text));
        return;
      }
      // Once the phrase is complete, move the spoken date/time out of the title and into the fields.
      const spoken = parseSpokenTask(text, locale);
      setTitle(join(spoken.title));
      if (spoken.date) {
        setDueDate(spoken.date);
        setDueDateAuto(false);
        setForceAdd(false);
      }
      if (spoken.time) {
        setRemindOffsets((offsets) => (offsets.length ? offsets : [0]));
        setRemindTime(spoken.time);
      }
    },
  });
  const { start: startListening, abort: abortListening } = voice;

  useEffect(() => {
    if (!visible) return;
    justResetRef.current = true;
    setTitle(initialTask?.title ?? '');
    setDescription(initialTask?.description ?? '');
    setDueDate(initialTask ? initialTask.dueDate : (defaultDueDate ?? dateForWhen('today')));
    setDueDateAuto(false);
    setDueDateManual(false);
    setIsImportant(initialTask ? isImportantQuadrant(initialTask.quadrantId) : true);
    setImportantTouched(!!initialTask);
    setTag(initialTask?.tag ?? null);
    setRemindOffsets(initialTask ? taskOffsets(initialTask) : [0]);
    setRemindTime(initialTask?.remindTime ?? null);
    setForceAdd(false);
  }, [visible, initialTask, defaultQuadrantId, defaultDueDate]);

  useEffect(() => {
    if (!visible) {
      abortListening();
    } else if (autoListen && !initialTask) {
      dictationBaseRef.current = '';
      startListening();
    }
  }, [visible, autoListen, initialTask, startListening, abortListening]);

  const handleMicPress = () => {
    if (!isPro) {
      openPaywall('voice');
      return;
    }
    if (voice.listening) {
      voice.stop();
    } else {
      dictationBaseRef.current = title.trim();
      voice.start();
    }
  };

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
    if (parsedDate && !dueDateManual) {
      setDueDate(parsedDate);
      setDueDateAuto(true);
    } else if (!parsedDate && dueDateAuto) {
      setDueDate(defaultDueDate ?? dateForWhen('today'));
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
    (task) => effectiveQuadrantId(task, escalationDays, today) === quadrantId && !task.done && task.id !== initialTask?.id,
  );
  // A task already sitting in this quadrant isn't being "added" to it, so the cap doesn't apply on edit.
  const alreadyInQuadrant =
    !!initialTask && !initialTask.done && effectiveQuadrantId(initialTask, escalationDays, today) === quadrantId;
  const isOverLimit = !alreadyInQuadrant && activeTasksInQuadrant.length >= MAX_ACTIVE_TASKS_PER_QUADRANT;
  const canSave = !!title.trim() && (!isOverLimit || forceAdd);

  const handleSave = () => {
    if (!canSave) return;
    onSave({ title, description, quadrantId, tag, dueDate, remindOffsets, remindTime });
  };

  const handleWhenPress = (option: Exclude<WhenOption, 'custom'>) => {
    setDueDate(dateForWhen(option));
    setDueDateAuto(false);
    setDueDateManual(true);
    setForceAdd(false);
  };

  const handleCustomDate = (value: string) => {
    setDueDate(value);
    setDueDateAuto(false);
    setDueDateManual(true);
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
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      maxHeight="88%"
      header={
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
                <TrashIcon color={theme.danger} size={18} />
              </Pressable>
            ) : (
              <View style={styles.iconSpacer} />
            )}
          </View>
            }>
      <SafeAreaView edges={['bottom']} style={styles.safeArea}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.form}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive">
            <TextField
              value={title}
              onChangeText={setTitle}
              placeholder={voice.listening ? t('voice.listening') : t('taskForm.titlePlaceholder')}
              autoFocus={!autoListen}
              accessory={
                <Pressable
                  onPress={handleMicPress}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={voice.listening ? t('voice.stop') : t('voice.start')}
                  style={[
                    styles.micButton,
                    voice.listening
                      ? { backgroundColor: theme.primary, borderColor: theme.primary }
                      : { backgroundColor: theme.glassBg, borderColor: theme.glassBorder },
                  ]}>
                  <MicIcon color={voice.listening ? theme.background : theme.primary} size={18} />
                </Pressable>
              }
            />
            {!!voice.error && (
              <ThemedText type="small" style={[styles.hint, { color: theme.danger }]}>
                {t(voice.error === 'denied' ? 'voice.denied' : 'voice.error')}
              </ThemedText>
            )}
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
              <CustomDatePill
                active={whenOption === 'custom'}
                label={customDateLabel}
                icon="📅"
                value={whenOption === 'custom' ? dueDate : null}
                onChange={handleCustomDate}
              />
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

            <RemindersSection
              offsets={remindOffsets}
              onOffsetsChange={setRemindOffsets}
              time={remindTime}
              onTimeChange={setRemindTime}
              dueDate={dueDate}
            />

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
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flexShrink: 1,
  },
  scroll: {
    flexShrink: 1,
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
  iconSpacer: {
    width: 34,
    height: 34,
  },
  micButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    justifyContent: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: Spacing.three,
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

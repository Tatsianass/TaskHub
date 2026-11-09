import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomSheetModal } from '@/components/bottom-sheet-modal';
import { CustomDatePill } from '@/components/custom-date-pill';
import { MicIcon, TrashIcon } from '@/components/header-icons';
import { OptionPill } from '@/components/option-pill';
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
import { addDaysISO, dayDiffFromToday, todayISODate } from '@/utils/dates';
import { computeQuadrant, effectiveQuadrantId, isImportantQuadrant, isUrgentDate } from '@/utils/priority';
import { taskOffsets } from '@/utils/reminders';
import { parseSmartDate, parseSpokenTask, suggestImportance } from '@/utils/smart-task';
import type { TaskDraft } from '@/hooks/use-tasks';
import { REPEAT_RULES } from '@/utils/recurrence';
import type { QuadrantId, RepeatRule, TagId, Task } from '@/types/task';

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

function dateForWhen(when: WhenOption): string | null {
  const today = todayISODate();
  if (when === 'today') return today;
  if (when === 'tomorrow') return addDaysISO(today, 1);
  if (when === 'week') return addDaysISO(today, 7);
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

const WHEN_OPTIONS: { id: Exclude<WhenOption, 'custom'>; labelKey: string }[] = [
  { id: 'today', labelKey: 'taskForm.when.today' },
  { id: 'tomorrow', labelKey: 'taskForm.when.tomorrow' },
  { id: 'week', labelKey: 'taskForm.when.week' },
  { id: 'none', labelKey: 'calendar.noDate' },
];

/**
 * Bottom-sheet form for creating or editing a task. The form body is remounted on every opening
 * (and when a different task is edited), so its state always starts from `initialTask`.
 */
export function TaskFormModal(props: Props) {
  const { visible, initialTask, onClose, onDelete } = props;
  const { t } = useLocale();
  const theme = useTheme();

  const [session, setSession] = useState(0);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setSession((n) => n + 1);
  }

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
              testID="task-form-delete"
              style={[styles.iconButton, { borderColor: theme.glassBorder, backgroundColor: theme.glassBg }]}>
              <TrashIcon color={theme.danger} size={18} />
            </Pressable>
          ) : (
            <View style={styles.iconSpacer} />
          )}
        </View>
      }>
      <TaskFormBody key={`${session}:${initialTask?.id ?? 'new'}`} {...props} />
    </BottomSheetModal>
  );
}

function TaskFormBody({
  visible,
  initialTask,
  defaultDueDate,
  autoListen = false,
  tasks,
  onSave,
  onToggleTask,
}: Props) {
  const { t, locale } = useLocale();
  const theme = useTheme();
  const { isPro, openPaywall } = usePro();
  const { escalationDays } = useEscalationSettings();
  const today = useToday();
  const [title, setTitle] = useState(initialTask?.title ?? '');
  const [description, setDescription] = useState(initialTask?.description ?? '');
  // The date picked via the pills/calendar/voice. While creating, a date typed into the title
  // ("buy milk tomorrow") takes precedence until the user picks one themselves.
  const [chosenDate, setChosenDate] = useState<string | null>(
    initialTask ? initialTask.dueDate : (defaultDueDate ?? dateForWhen('today')),
  );
  const [dueDateManual, setDueDateManual] = useState(false);
  const [importantChoice, setImportantChoice] = useState(
    initialTask ? isImportantQuadrant(initialTask.quadrantId) : true,
  );
  const [importantTouched, setImportantTouched] = useState(!!initialTask);
  const [tag, setTag] = useState<TagId | null>(initialTask?.tag ?? null);
  // A new task starts as all-day with one alert on the day; switching it off leaves no reminder.
  const [remindOffsets, setRemindOffsets] = useState<number[]>(initialTask ? taskOffsets(initialTask) : [0]);
  const [remindTime, setRemindTime] = useState<string | null>(initialTask?.remindTime ?? null);
  const [repeat, setRepeat] = useState<RepeatRule | null>(initialTask?.repeat ?? null);
  const [forceAdd, setForceAdd] = useState(false);
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
        setChosenDate(spoken.date);
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

  // Smart date + importance suggestions from the title text — only while creating a new task.
  const trimmedTitle = title.trim();
  const autoDate = useMemo(
    () => (initialTask || dueDateManual || !trimmedTitle ? null : parseSmartDate(trimmedTitle, locale)),
    [initialTask, dueDateManual, trimmedTitle, locale],
  );
  const suggestedImportance = useMemo(
    () => (initialTask || importantTouched || !trimmedTitle ? null : suggestImportance(trimmedTitle, locale)),
    [initialTask, importantTouched, trimmedTitle, locale],
  );
  const dueDate = autoDate ?? chosenDate;
  const dueDateAuto = autoDate !== null;
  const isImportant = suggestedImportance ?? importantChoice;

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
    onSave({ title, description, quadrantId, tag, dueDate, remindOffsets, remindTime, repeat: dueDate ? repeat : null });
  };

  const pickDate = (value: string | null) => {
    setChosenDate(value);
    setDueDateManual(true);
    setForceAdd(false);
  };

  const pickImportance = (important: boolean) => {
    setImportantChoice(important);
    setImportantTouched(true);
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
        <TextField label={t('taskForm.descriptionLabel')} value={description} onChangeText={setDescription} />

        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
          {t('taskForm.whenLabel')}
        </ThemedText>
        <View style={styles.pillRow}>
          {WHEN_OPTIONS.map((option) => (
            <OptionPill
              key={option.id}
              label={t(option.labelKey)}
              active={whenOption === option.id}
              onPress={() => pickDate(dateForWhen(option.id))}
              style={styles.pill}
            />
          ))}
          <CustomDatePill
            active={whenOption === 'custom'}
            label={customDateLabel}
            icon="📅"
            value={whenOption === 'custom' ? dueDate : null}
            onChange={pickDate}
          />
        </View>
        {!!dateHint && (
          <ThemedText type="small" themeColor="primary" style={styles.hint}>
            {dateHint}
          </ThemedText>
        )}

        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
          {t('taskForm.repeatLabel')}
        </ThemedText>
        <View style={[styles.pillRow, !dueDate && styles.disabled]} testID="repeat-options">
          {[null, ...REPEAT_RULES].map((rule) => (
            <OptionPill
              key={rule ?? 'none'}
              label={t(`repeat.${rule ?? 'none'}`)}
              active={(dueDate ? repeat : null) === rule}
              disabled={!dueDate}
              onPress={() => setRepeat(rule)}
              testID={`repeat-${rule ?? 'none'}`}
              style={styles.pill}
            />
          ))}
        </View>
        {!dueDate && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
            {t('taskForm.repeatNeedsDate')}
          </ThemedText>
        )}

        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
          {t('taskForm.importanceLabel')}
        </ThemedText>
        <View style={[styles.segmented, { borderColor: theme.glassBorder, backgroundColor: theme.glassBg }]}>
          {[
            { important: false, labelKey: 'taskForm.importanceLow' },
            { important: true, labelKey: 'taskForm.importanceHigh' },
          ].map(({ important, labelKey }) => {
            const selected = isImportant === important;
            return (
              <Pressable key={labelKey} style={styles.segmentWrapper} onPress={() => pickImportance(important)}>
                <View style={[styles.segment, selected && { backgroundColor: theme.backgroundSelected }]}>
                  <ThemedText type="smallBold" themeColor={selected ? 'text' : 'textSecondary'}>
                    {t(labelKey)}
                  </ThemedText>
                </View>
              </Pressable>
            );
          })}
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          {t('taskForm.importanceHint')}
        </ThemedText>

        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
          {t('taskForm.tagLabel')}
        </ThemedText>
        <View style={styles.categoryRow}>
          {TAGS.map((tagOption) => (
            <OptionPill
              key={tagOption.id}
              active={tag === tagOption.id}
              onPress={() => setTag(tagOption.id)}
              label={t(tagOption.labelKey)}
              style={styles.pill}
              wrapperStyle={styles.categoryItem}>
              <ThemedText style={styles.pillIcon}>{tagOption.icon}</ThemedText>
            </OptionPill>
          ))}
          <OptionPill
            active={tag === null}
            onPress={() => setTag(null)}
            label={t('tag.none')}
            style={styles.pill}
            wrapperStyle={styles.categoryItem}
          />
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
            <ThemedText type="smallBold">{t('taskForm.swapTitle', { count: activeTasksInQuadrant.length })}</ThemedText>
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
  disabled: {
    opacity: 0.4,
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

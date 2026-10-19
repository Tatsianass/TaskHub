import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { GlassPanel } from '@/components/glass-panel';
import { ReminderPickerSheet } from '@/components/reminder-picker-sheet';
import { ThemedText } from '@/components/themed-text';
import { TimePickerSheet } from '@/components/time-picker-sheet';
import { Spacing } from '@/constants/theme';
import { useLocale } from '@/context/locale-context';
import { useNotificationsSettings } from '@/context/notifications-context';
import { useCustomReminderOffsets } from '@/hooks/use-custom-reminder-offsets';
import { useTheme } from '@/hooks/use-theme';
import { hexToRgba } from '@/utils/colors';
import {
  ALL_DAY_PRESETS,
  alertOutlook,
  DEFAULT_REMIND_TIME,
  MAX_REMINDERS,
  TIMED_PRESETS,
  offsetLabel,
  reminderDate,
} from '@/utils/reminders';

type Props = {
  /** Minutes before the anchor time for each alert; empty means no reminder. */
  offsets: number[];
  onOffsetsChange: (offsets: number[]) => void;
  /** HH:mm the task happens at; null for an all-day task, whose alerts use the default reminder time. */
  time: string | null;
  onTimeChange: (time: string | null) => void;
  /** YYYY-MM-DD, or null while the task has no date (then nothing can fire). */
  dueDate: string | null;
};

/**
 * Reminders as one-tap chips: pick the task's time (or leave it all-day), then toggle how early to be
 * told. A line underneath always says when the next alert will actually go off.
 */
export function RemindersSection({ offsets, onOffsetsChange, time, onTimeChange, dueDate }: Props) {
  const { t, locale } = useLocale();
  const theme = useTheme();
  const { morningTime } = useNotificationsSettings();
  const custom = useCustomReminderOffsets();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);

  const presets: readonly number[] = time ? TIMED_PRESETS : ALL_DAY_PRESETS;
  // Alerts picked earlier (or set for a different kind of time) stay visible so they can be switched off.
  const extras = offsets.filter((offset) => !presets.includes(offset)).sort((a, b) => a - b);
  const chips = [...presets, ...extras];
  const full = offsets.length >= MAX_REMINDERS;
  const anchor = time ?? morningTime;

  const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const fireDate = (offset: number) => (dueDate ? reminderDate(dueDate, anchor, offset) : null);

  const outlook = alertOutlook(dueDate, anchor, offsets);
  const summary =
    outlook.kind === 'needDate'
      ? { text: t('reminders.needDate'), warn: true }
      : outlook.kind === 'passed'
        ? { text: t('reminders.passed'), warn: false }
        : outlook.kind === 'next'
          ? { text: t('reminders.next', { date: formatter.format(outlook.date) }), warn: false }
          : null;

  const chipLabel = (offset: number) =>
    offset === 0 ? t(time ? 'reminders.atTime' : 'reminders.onDay') : offsetLabel(t, offset);

  const toggle = (offset: number) => {
    if (offsets.includes(offset)) onOffsetsChange(offsets.filter((item) => item !== offset));
    else if (!full) onOffsetsChange([...offsets, offset]);
  };

  const pickCustom = (minutes: number) => {
    custom.remember(minutes);
    if (!full) onOffsetsChange([...offsets, minutes]);
    setPickerOpen(false);
  };

  const fireText = (offset: number) => {
    const date = fireDate(offset);
    return date ? t('reminders.fires', { date: formatter.format(date) }) : null;
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.titleRow}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('reminders.title')}
        </ThemedText>
        {offsets.length > 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            {offsets.length}/{MAX_REMINDERS}
          </ThemedText>
        )}
      </View>

      <GlassPanel>
        <Pressable onPress={() => setTimeOpen(true)} style={styles.row} accessibilityRole="button">
          <View style={[styles.badge, { backgroundColor: hexToRgba(theme.primary, 0.18) }]}>
            <ThemedText>🕘</ThemedText>
          </View>
          <View style={styles.rowText}>
            <ThemedText>{t('reminders.timeLabel')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {time ? t('reminders.timeHint') : t('reminders.allDayHint', { time: morningTime })}
            </ThemedText>
          </View>
          <View style={[styles.timePill, { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText type="small">{time ?? t('reminders.allDay')}</ThemedText>
          </View>
        </Pressable>
      </GlassPanel>

      <View style={styles.chips}>
        {chips.map((offset) => {
          const active = offsets.includes(offset);
          const disabled = !active && full;
          return (
            <Pressable
              key={offset}
              onPress={() => toggle(offset)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled }}
              style={[
                styles.chip,
                { borderColor: theme.glassBorder, backgroundColor: theme.glassBg },
                active && { borderColor: theme.primary, backgroundColor: hexToRgba(theme.primary, 0.18) },
                disabled && styles.chipDisabled,
              ]}>
              <ThemedText type="small" themeColor={active ? 'text' : 'textSecondary'}>
                {active ? '🔔 ' : ''}
                {chipLabel(offset)}
              </ThemedText>
            </Pressable>
          );
        })}
        {!full && (
          <Pressable
            onPress={() => setPickerOpen(true)}
            accessibilityRole="button"
            style={[styles.chip, { borderColor: theme.glassBorder, backgroundColor: theme.glassBg }]}>
            <ThemedText type="small" themeColor="primary">
              {t('reminders.other')}
            </ThemedText>
          </Pressable>
        )}
      </View>

      {summary ? (
        <ThemedText type="small" themeColor={summary.warn ? undefined : 'textSecondary'} style={summary.warn && { color: theme.danger }}>
          {summary.text}
        </ThemedText>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          {full ? t('reminders.limit', { max: MAX_REMINDERS }) : t('reminders.none')}
        </ThemedText>
      )}

      <ReminderPickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        taken={offsets}
        mine={custom.offsets}
        fireText={fireText}
        onPick={pickCustom}
        onForget={custom.forget}
      />
      <TimePickerSheet
        visible={timeOpen}
        value={time ?? DEFAULT_REMIND_TIME}
        onClose={() => setTimeOpen(false)}
        onChange={onTimeChange}
        onClear={time ? () => onTimeChange(null) : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: Spacing.two },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2, paddingHorizontal: Spacing.three - 4, paddingVertical: Spacing.two + 4 },
  rowText: { flex: 1 },
  badge: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  timePill: { height: 32, minWidth: 64, paddingHorizontal: Spacing.three, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { height: 38, paddingHorizontal: Spacing.three, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipDisabled: { opacity: 0.4 },
});

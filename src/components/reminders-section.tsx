import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { GlassPanel } from '@/components/glass-panel';
import { PlusIcon } from '@/components/header-icons';
import { ReminderPickerSheet } from '@/components/reminder-picker-sheet';
import { ThemedText } from '@/components/themed-text';
import { TimePickerSheet } from '@/components/time-picker-sheet';
import { Spacing } from '@/constants/theme';
import { useLocale } from '@/context/locale-context';
import { useCustomReminderOffsets } from '@/hooks/use-custom-reminder-offsets';
import { useTheme } from '@/hooks/use-theme';
import { hexToRgba } from '@/utils/colors';
import { MAX_REMINDERS, offsetLabel, reminderDate } from '@/utils/reminders';

type Props = {
  /** Minutes before `time` for each alert; empty means no reminder. */
  offsets: number[];
  onOffsetsChange: (offsets: number[]) => void;
  /** HH:mm the alerts count back from. */
  time: string;
  onTimeChange: (time: string) => void;
  /** YYYY-MM-DD, or null while the task has no date (then nothing can fire). */
  dueDate: string | null;
};

/** The task's alerts, as a list you add to and remove from; replaces the old on/off switch. */
export function RemindersSection({ offsets, onOffsetsChange, time, onTimeChange, dueDate }: Props) {
  const { t, locale } = useLocale();
  const theme = useTheme();
  const custom = useCustomReminderOffsets();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);

  const showAdd = offsets.length < MAX_REMINDERS;
  const sorted = [...offsets].sort((a, b) => b - a);
  const badge = { backgroundColor: hexToRgba(theme.primary, 0.18) };
  const divider = { borderBottomColor: theme.glassBorder };

  const fireText = (offset: number) =>
    dueDate
      ? t('reminders.fires', {
          date: new Intl.DateTimeFormat(locale, {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          }).format(reminderDate(dueDate, time, offset)),
        })
      : null;

  const pick = (minutes: number) => {
    custom.remember(minutes);
    onOffsetsChange([...offsets, minutes]);
    setPickerOpen(false);
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

      {offsets.length > 0 && (
        <GlassPanel>
          <Pressable onPress={() => setTimeOpen(true)} style={styles.row}>
            <View style={[styles.badge, badge]}>
              <ThemedText>🕘</ThemedText>
            </View>
            <View style={styles.rowText}>
              <ThemedText>{t('reminders.timeLabel')}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {t('reminders.timeHint')}
              </ThemedText>
            </View>
            <View style={[styles.timePill, { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText type="small">{time}</ThemedText>
            </View>
          </Pressable>
        </GlassPanel>
      )}

      <GlassPanel>
        {sorted.length === 0 && (
          <View style={[styles.row, divider, styles.rowBorder]}>
            <ThemedText themeColor="textSecondary">🔕 {t('reminders.none')}</ThemedText>
          </View>
        )}
        {sorted.map((offset, index) => (
          <View key={offset} style={[styles.row, (showAdd || index < sorted.length - 1) && styles.rowBorder, divider]}>
            <View style={[styles.badge, badge]}>
              <ThemedText>🔔</ThemedText>
            </View>
            <View style={styles.rowText}>
              <ThemedText>{offsetLabel(t, offset)}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {fireText(offset) ?? t('reminders.needDate')}
              </ThemedText>
            </View>
            <Pressable
              onPress={() => onOffsetsChange(offsets.filter((item) => item !== offset))}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('reminders.remove')}
              style={[styles.remove, { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText type="smallBold">−</ThemedText>
            </Pressable>
          </View>
        ))}
        {showAdd && (
          <Pressable onPress={() => setPickerOpen(true)} style={styles.row}>
            <PlusIcon color={theme.primary} size={22} />
            <ThemedText themeColor="primary">
              {t(offsets.length ? 'reminders.addAnother' : 'reminders.add')}
            </ThemedText>
          </Pressable>
        )}
      </GlassPanel>
      {offsets.length >= MAX_REMINDERS && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('reminders.limit', { max: MAX_REMINDERS })}
        </ThemedText>
      )}

      <ReminderPickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        taken={offsets}
        mine={custom.offsets}
        fireText={fireText}
        onPick={pick}
        onForget={custom.forget}
      />
      <TimePickerSheet visible={timeOpen} value={time} onClose={() => setTimeOpen(false)} onChange={onTimeChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: Spacing.two },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2, paddingHorizontal: Spacing.three - 4, paddingVertical: Spacing.two + 4 },
  rowBorder: { borderBottomWidth: 1 },
  rowText: { flex: 1 },
  badge: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  timePill: { height: 32, minWidth: 64, paddingHorizontal: Spacing.three, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  remove: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});

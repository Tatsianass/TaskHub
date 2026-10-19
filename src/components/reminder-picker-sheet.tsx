import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomSheetModal } from '@/components/bottom-sheet-modal';
import { TrashIcon } from '@/components/header-icons';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useLocale } from '@/context/locale-context';
import { useTheme } from '@/hooks/use-theme';
import { MAX_OFFSET_MINUTES, offsetLabel } from '@/utils/reminders';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Alerts the task already has; they can't be picked twice. */
  taken: number[];
  /** Timings the user typed in earlier. */
  mine: number[];
  /** When an alert `offset` minutes before the task time would go off; null if the task has no date. */
  fireText: (offset: number) => string | null;
  onPick: (minutes: number) => void;
  onForget: (minutes: number) => void;
};

type Unit = 'minute' | 'hour' | 'day';
const UNITS: { id: Unit; minutes: number; labelKey: string }[] = [
  { id: 'minute', minutes: 1, labelKey: 'reminders.unitMinute' },
  { id: 'hour', minutes: 60, labelKey: 'reminders.unitHour' },
  { id: 'day', minutes: 1440, labelKey: 'reminders.unitDay' },
];

export function ReminderPickerSheet(props: Props) {
  const { t } = useLocale();
  const theme = useTheme();

  return (
    <BottomSheetModal
      visible={props.visible}
      onClose={props.onClose}
      maxHeight="85%"
      header={
        <View style={styles.header}>
          <View style={styles.headerSide} />
          <ThemedText type="smallBold">{t('reminders.pickerTitle')}</ThemedText>
          <Pressable
            onPress={props.onClose}
            hitSlop={8}
            style={[styles.close, { borderColor: theme.glassBorder, backgroundColor: theme.glassBg }]}>
            <ThemedText style={styles.closeIcon}>✕</ThemedText>
          </Pressable>
        </View>
      }>
      {/* Only mounted while the sheet is open, so the custom entry starts fresh every time. */}
      <ReminderPickerBody {...props} />
    </BottomSheetModal>
  );
}

function ReminderPickerBody({ taken, mine, fireText, onPick, onForget }: Props) {
  const { t } = useLocale();
  const theme = useTheme();
  const [amount, setAmount] = useState('3');
  const [unit, setUnit] = useState<Unit>('minute');
  const [error, setError] = useState<string | null>(null);

  const addCustom = () => {
    const minutes = Math.round(Number(amount)) * (UNITS.find((item) => item.id === unit)?.minutes ?? 1);
    if (!Number.isFinite(minutes) || minutes < 1) return setError(t('reminders.errorZero'));
    if (minutes > MAX_OFFSET_MINUTES) return setError(t('reminders.errorMax'));
    if (taken.includes(minutes)) return setError(t('reminders.errorDuplicate'));
    onPick(minutes);
  };

  const renderOption = (minutes: number, removable: boolean) => {
    const isTaken = taken.includes(minutes);
    const hint = fireText(minutes);
    return (
      <Pressable
        key={minutes}
        disabled={isTaken}
        onPress={() => onPick(minutes)}
        style={[styles.option, { borderBottomColor: theme.glassBorder }, isTaken && styles.taken]}>
        <ThemedText style={styles.optionLabel}>{offsetLabel(t, minutes)}</ThemedText>
        {isTaken ? (
          <ThemedText themeColor="primary">✓</ThemedText>
        ) : (
          !!hint && (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {hint}
            </ThemedText>
          )
        )}
        {removable && (
          <Pressable
            onPress={() => onForget(minutes)}
            hitSlop={8}
            accessibilityLabel={t('reminders.forget')}
            style={[styles.round, { backgroundColor: theme.backgroundSelected }]}>
            <TrashIcon color={theme.text} size={14} />
          </Pressable>
        )}
      </Pressable>
    );
  };

  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {mine.length > 0 && (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                {t('reminders.mine')}
              </ThemedText>
              <View>{mine.map((minutes) => renderOption(minutes, true))}</View>
            </>
          )}

          <ThemedText type="small" themeColor="textSecondary">
            {t('reminders.custom')}
          </ThemedText>
          <View style={styles.custom}>
            <TextInput
              value={amount}
              onChangeText={(text) => {
                setAmount(text.replace(/\D/g, '').slice(0, 3));
                setError(null);
              }}
              keyboardType="number-pad"
              style={[styles.input, { color: theme.text, borderColor: theme.glassBorder, backgroundColor: theme.glassBg }]}
            />
            {UNITS.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => {
                  setUnit(item.id);
                  setError(null);
                }}
                style={[
                  styles.unit,
                  { borderColor: theme.glassBorder, backgroundColor: theme.glassBg },
                  unit === item.id && { backgroundColor: theme.backgroundSelected },
                ]}>
                <ThemedText type="small" themeColor={unit === item.id ? 'text' : 'textSecondary'}>
                  {t(item.labelKey)}
                </ThemedText>
              </Pressable>
            ))}
            <Pressable onPress={addCustom} style={[styles.addButton, { backgroundColor: theme.primary }]}>
              <ThemedText type="smallBold" style={{ color: theme.background }}>
                {t('reminders.customAdd')}
              </ThemedText>
            </Pressable>
          </View>
          {!!error && (
            <ThemedText type="small" style={{ color: theme.danger }}>
              {error}
            </ThemedText>
          )}
        </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flexShrink: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.three },
  headerSide: { width: 34 },
  close: { width: 34, height: 34, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  closeIcon: { fontSize: 15 },
  body: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.four, gap: Spacing.two },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three - 4,
    borderBottomWidth: 1,
  },
  optionLabel: { flex: 1 },
  taken: { opacity: 0.45 },
  round: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  custom: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  input: {
    width: 64,
    height: 40,
    textAlign: 'center',
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 16,
  },
  unit: {
    height: 40,
    paddingHorizontal: Spacing.three - 2,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    height: 40,
    marginLeft: 'auto',
    paddingHorizontal: Spacing.three,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

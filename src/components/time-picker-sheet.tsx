import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomSheetModal } from '@/components/bottom-sheet-modal';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useLocale } from '@/context/locale-context';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  visible: boolean;
  /** HH:mm */
  value: string;
  onClose: () => void;
  onChange: (value: string) => void;
};

const QUICK_TIMES = ['08:00', '09:00', '12:00', '18:00', '21:00'];
const MINUTE_STEP = 5;

const pad = (n: number) => String(n).padStart(2, '0');

function Chevron({ up, color }: { up: boolean; color: string }) {
  return (
    <View
      style={[
        styles.chevron,
        { borderColor: color, transform: [{ rotate: up ? '-135deg' : '45deg' }, { translateY: up ? 2 : -2 }] },
      ]}
    />
  );
}

function Stepper({ value, onUp, onDown }: { value: number; onUp: () => void; onDown: () => void }) {
  const theme = useTheme();
  const button = [styles.stepButton, { borderColor: theme.glassBorder, backgroundColor: theme.glassBg }];
  return (
    <View style={styles.column}>
      <Pressable onPress={onUp} hitSlop={6} style={button}>
        <Chevron up color={theme.text} />
      </Pressable>
      <ThemedText style={styles.digits}>{pad(value)}</ThemedText>
      <Pressable onPress={onDown} hitSlop={6} style={button}>
        <Chevron up={false} color={theme.text} />
      </Pressable>
    </View>
  );
}

/** Our own time picker: the native one opens as a white popup that covers the form. */
export function TimePickerSheet({ visible, value, onClose, onChange }: Props) {
  const { t } = useLocale();
  const theme = useTheme();

  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      header={
        <View style={styles.header}>
          <View style={styles.headerSide} />
          <ThemedText type="smallBold">{t('reminders.timePickerTitle')}</ThemedText>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            style={[styles.close, { borderColor: theme.glassBorder, backgroundColor: theme.glassBg }]}>
            <ThemedText style={styles.closeIcon}>✕</ThemedText>
          </Pressable>
        </View>
      }>
      {/* Only mounted while the sheet is open, so it starts from the current value every time. */}
      <TimePickerBody
        value={value}
        onDone={(next) => {
          onChange(next);
          onClose();
        }}
      />
    </BottomSheetModal>
  );
}

function TimePickerBody({ value, onDone }: { value: string; onDone: (value: string) => void }) {
  const { t } = useLocale();
  const theme = useTheme();
  const [initialHours, initialMinutes] = value.split(':').map(Number);
  const [hours, setHours] = useState(initialHours);
  const [minutes, setMinutes] = useState(initialMinutes);
  const current = `${pad(hours)}:${pad(minutes)}`;

  return (
    <SafeAreaView edges={['bottom']} style={styles.body}>
      <View style={styles.steppers}>
        <Stepper value={hours} onUp={() => setHours((hours + 1) % 24)} onDown={() => setHours((hours + 23) % 24)} />
        <ThemedText style={styles.colon} themeColor="textSecondary">
          :
        </ThemedText>
        <Stepper
          value={minutes}
          onUp={() => setMinutes((minutes + MINUTE_STEP) % 60)}
          onDown={() => setMinutes((minutes + 60 - MINUTE_STEP) % 60)}
        />
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {t('reminders.quickPick')}
      </ThemedText>
      <View style={styles.pills}>
        {QUICK_TIMES.map((time) => (
          <Pressable
            key={time}
            onPress={() => {
              const [h, m] = time.split(':').map(Number);
              setHours(h);
              setMinutes(m);
            }}
            style={[
              styles.pill,
              { borderColor: theme.glassBorder, backgroundColor: theme.glassBg },
              time === current && { backgroundColor: theme.backgroundSelected },
            ]}>
            <ThemedText type="small" themeColor={time === current ? 'text' : 'textSecondary'}>
              {time}
            </ThemedText>
          </Pressable>
        ))}
      </View>
      <PrimaryButton title={t('picker.done')} onPress={() => onDone(current)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.three },
  headerSide: { width: 34 },
  close: { width: 34, height: 34, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  closeIcon: { fontSize: 15 },
  body: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.four, gap: Spacing.three },
  steppers: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  column: { alignItems: 'center', gap: Spacing.two },
  stepButton: { width: 48, height: 38, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chevron: { width: 10, height: 10, borderRightWidth: 2, borderBottomWidth: 2 },
  digits: { fontSize: 40, lineHeight: 48, fontWeight: 500, minWidth: 64, textAlign: 'center' },
  colon: { fontSize: 36, lineHeight: 44, marginTop: -2 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  pill: {
    height: 40,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

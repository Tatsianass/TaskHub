import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useLocale } from '@/context/locale-context';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  label?: string;
  placeholder: string;
  value: string | null;
  onChange: (value: string) => void;
};

function toDate(value: string | null): Date {
  const date = new Date();
  if (!value) return date;
  const [hours, minutes] = value.split(':').map(Number);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function toHHMM(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function TimeField({ label, placeholder, value, onChange }: Props) {
  const theme = useTheme();
  const { t, locale } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  // iOS: the wheel reports every scroll step, so the choice is kept here until "Done".
  const [draft, setDraft] = useState<Date>(() => toDate(value));

  const open = () => {
    setDraft(toDate(value));
    setIsOpen(true);
  };
  const confirm = () => {
    onChange(toHHMM(draft));
    setIsOpen(false);
  };

  const handleChange = (event: DateTimePickerEvent, date?: Date) => {
    setIsOpen(false);
    if (event.type === 'set' && date) onChange(toHHMM(date));
  };

  return (
    <View style={styles.wrapper}>
      {!!label && (
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
      )}
      <Pressable
        onPress={open}
        style={[styles.input, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <ThemedText themeColor={value ? 'text' : 'textSecondary'}>{value || placeholder}</ThemedText>
      </Pressable>
      {isOpen &&
        (Platform.OS === 'ios' ? (
          <View style={[styles.panel, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <DateTimePicker
              value={draft}
              mode="time"
              display="spinner"
              locale={locale}
              themeVariant={theme.scheme}
              onChange={(_event, date) => date && setDraft(date)}
            />
            <Pressable onPress={confirm} style={[styles.done, { backgroundColor: theme.primary }]}>
              <ThemedText style={{ color: theme.background, fontWeight: '700' }}>{t('picker.done')}</ThemedText>
            </Pressable>
          </View>
        ) : (
          <DateTimePicker value={toDate(value)} mode="time" onChange={handleChange} />
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.one,
  },
  panel: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    padding: Spacing.two,
    gap: Spacing.two,
  },
  done: {
    alignItems: 'center',
    paddingVertical: Spacing.two + 2,
    borderRadius: Spacing.two,
  },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Spacing.two,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
});

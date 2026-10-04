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
  onChange: (value: string | null) => void;
};

function toDate(value: string | null) {
  return value ? new Date(`${value}T00:00:00`) : new Date();
}

function toISODate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function DateField({ label, placeholder, value, onChange }: Props) {
  const theme = useTheme();
  const { locale } = useLocale();
  const [isOpen, setIsOpen] = useState(false);

  const handleChange = (event: DateTimePickerEvent, date?: Date) => {
    setIsOpen(false);
    if (event.type === 'set' && date) onChange(toISODate(date));
  };

  return (
    <View style={styles.wrapper}>
      {!!label && (
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
      )}
      <Pressable
        onPress={() => setIsOpen(true)}
        style={[styles.input, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <ThemedText themeColor={value ? 'text' : 'textSecondary'}>{value || placeholder}</ThemedText>
        {!!value && (
          <Pressable hitSlop={8} onPress={() => onChange(null)}>
            <ThemedText themeColor="textSecondary">✕</ThemedText>
          </Pressable>
        )}
      </Pressable>
      {isOpen &&
        (Platform.OS === 'ios' ? (
          // The default iOS style is a system-drawn pill that ignores the app's theme; an inline
          // calendar in a themed panel matches the rest of the form.
          <View style={[styles.panel, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <DateTimePicker
              value={toDate(value)}
              mode="date"
              display="inline"
              locale={locale}
              themeVariant={theme.scheme}
              accentColor={theme.primary}
              onChange={handleChange}
            />
          </View>
        ) : (
          <DateTimePicker value={toDate(value)} mode="date" onChange={handleChange} />
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

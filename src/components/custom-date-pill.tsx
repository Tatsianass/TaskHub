import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useLocale } from '@/context/locale-context';
import { useThemeMode } from '@/context/theme-mode-context';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  active: boolean;
  label: string;
  icon?: string;
  /** Currently chosen date (YYYY-MM-DD); the calendar opens on it. */
  value?: string | null;
  onChange: (value: string) => void;
};

function toDate(value: string | null | undefined) {
  return value ? new Date(`${value}T00:00:00`) : new Date();
}

function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function CustomDatePill({ active, label, icon, value, onChange }: Props) {
  const theme = useTheme();
  const { mode } = useThemeMode();
  const { locale } = useLocale();
  const [isOpen, setIsOpen] = useState(false);

  const handleChange = (event: DateTimePickerEvent, date?: Date) => {
    setIsOpen(false);
    if (event.type === 'set' && date) onChange(toISODate(date));
  };

  return (
    <>
      <Pressable onPress={() => setIsOpen((open) => !open)}>
        <View
          style={[
            styles.pill,
            { borderColor: theme.glassBorder, backgroundColor: theme.glassBg },
            active && { backgroundColor: theme.backgroundSelected },
          ]}>
          {!!icon && <ThemedText style={styles.icon}>{icon}</ThemedText>}
          <ThemedText type="small" themeColor={active ? 'text' : 'textSecondary'}>
            {label}
          </ThemedText>
        </View>
      </Pressable>
      {isOpen &&
        (Platform.OS === 'ios' ? (
          // iOS: a full calendar right in the form (the default "compact" style
          // would need a second tap). Full width, so it wraps below the pills.
          <View style={styles.inlineCalendar}>
            <DateTimePicker
              value={toDate(value)}
              mode="date"
              display="inline"
              locale={locale}
              themeVariant={mode}
              accentColor={theme.primary}
              onChange={handleChange}
            />
          </View>
        ) : (
          // Android opens its own calendar dialog on the first tap.
          <DateTimePicker value={toDate(value)} mode="date" onChange={handleChange} />
        ))}
    </>
  );
}

const styles = StyleSheet.create({
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
  icon: {
    fontSize: 14,
  },
  inlineCalendar: {
    width: '100%',
  },
});

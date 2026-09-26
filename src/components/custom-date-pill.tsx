import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  active: boolean;
  label: string;
  icon?: string;
  onChange: (value: string) => void;
};

function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function CustomDatePill({ active, label, icon, onChange }: Props) {
  const theme = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  const handleChange = (event: DateTimePickerEvent, date?: Date) => {
    setIsOpen(false);
    if (event.type === 'set' && date) onChange(toISODate(date));
  };

  return (
    <>
      <Pressable onPress={() => setIsOpen(true)}>
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
      {isOpen && <DateTimePicker value={new Date()} mode="date" onChange={handleChange} />}
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
});

import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { hexToRgba } from '@/utils/colors';

/** What a day cell shows under its number: one dot per task, and a cake for birthdays. */
export type DayMarks = { dots: { color: string; done: boolean }[]; birthday: boolean };

type Props = {
  year: number;
  /** 0-based, like Date#getMonth. */
  month: number;
  /** 0 = weeks start on Sunday, 1 = Monday. */
  weekStartsOn: 0 | 1;
  weekdayLabels: string[];
  today: string;
  selected: string;
  marks: Map<string, DayMarks>;
  onSelect: (date: string) => void;
};

const MAX_DOTS = 3;

export function toISODate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Every day shown for the month, padded with the neighbouring months' days to whole weeks. */
function monthCells(year: number, month: number, weekStartsOn: 0 | 1) {
  const first = new Date(year, month, 1);
  const leading = (first.getDay() - weekStartsOn + 7) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const total = Math.ceil((leading + daysInMonth) / 7) * 7;
  return Array.from({ length: total }, (_, index) => {
    const date = new Date(year, month, index - leading + 1);
    return { date: toISODate(date), day: date.getDate(), inMonth: date.getMonth() === month };
  });
}

export function MonthGrid({ year, month, weekStartsOn, weekdayLabels, today, selected, marks, onSelect }: Props) {
  const theme = useTheme();
  const cells = monthCells(year, month, weekStartsOn);

  return (
    <View>
      <View style={styles.row}>
        {weekdayLabels.map((label, index) => (
          <ThemedText key={index} type="small" themeColor="textSecondary" style={styles.weekday}>
            {label}
          </ThemedText>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((cell) => {
          const isSelected = cell.date === selected;
          const isToday = cell.date === today;
          const mark = marks.get(cell.date);
          return (
            <Pressable
              key={cell.date}
              style={styles.cellWrapper}
              onPress={() => onSelect(cell.date)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}>
              <View
                style={[
                  styles.cell,
                  isSelected && { backgroundColor: theme.backgroundSelected, borderColor: theme.primary },
                  isToday && !isSelected && { backgroundColor: hexToRgba(theme.primary, 0.14) },
                ]}>
                <ThemedText
                  type={isToday || isSelected ? 'smallBold' : 'small'}
                  themeColor={isToday ? 'primary' : cell.inMonth ? 'text' : 'textSecondary'}
                  style={!cell.inMonth && styles.outside}>
                  {cell.day}
                </ThemedText>
                <View style={styles.marks}>
                  {mark?.dots.slice(0, MAX_DOTS).map((dot, index) => (
                    <View
                      key={index}
                      style={[styles.dot, { backgroundColor: dot.color }, dot.done && styles.dotDone]}
                    />
                  ))}
                  {mark?.birthday && <ThemedText style={styles.cake}>🎂</ThemedText>}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginBottom: Spacing.one,
  },
  weekday: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cellWrapper: {
    width: `${100 / 7}%`,
    padding: 2,
  },
  cell: {
    height: 44,
    borderRadius: Spacing.three,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  outside: {
    opacity: 0.5,
  },
  marks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 8,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  dotDone: {
    opacity: 0.35,
  },
  cake: {
    fontSize: 8,
    lineHeight: 10,
  },
});

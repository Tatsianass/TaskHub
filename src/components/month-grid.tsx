import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** What a day cell shows under its number: one dot per task, and a pink dot for birthdays. */
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
  // The third blob is the palette's pink/warm accent in every theme, so birthdays stay on-palette.
  const birthdayColor = theme.blobs[2];

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
          const dots = [
            ...(mark?.birthday ? [{ color: birthdayColor, done: false }] : []),
            ...(mark?.dots ?? []),
          ].slice(0, MAX_DOTS);
          const content = (
            <>
              <ThemedText
                type={isToday || isSelected ? 'smallBold' : 'small'}
                themeColor={isToday && !isSelected ? 'primary' : cell.inMonth ? 'text' : 'textSecondary'}
                style={[isSelected && styles.selectedText, !cell.inMonth && !isSelected && styles.outside]}>
                {cell.day}
              </ThemedText>
              <View style={styles.marks}>
                {dots.map((dot, index) => (
                  <View
                    key={index}
                    style={[
                      styles.dot,
                      { backgroundColor: isSelected ? '#ffffff' : dot.color },
                      dot.done && styles.dotDone,
                    ]}
                  />
                ))}
              </View>
            </>
          );
          return (
            <Pressable
              key={cell.date}
              style={styles.cellWrapper}
              onPress={() => onSelect(cell.date)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}>
              {isSelected ? (
                <LinearGradient
                  colors={[theme.gradientStart, theme.gradientEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.cell}>
                  {content}
                </LinearGradient>
              ) : (
                <View style={[styles.cell, isToday && { borderColor: theme.primary }]}>{content}</View>
              )}
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
    alignItems: 'center',
    paddingVertical: 1,
  },
  // A circle: the selected day is filled with the theme gradient, today only gets a ring.
  cell: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  selectedText: {
    color: '#ffffff',
  },
  outside: {
    opacity: 0.4,
  },
  marks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotDone: {
    opacity: 0.35,
  },
});

import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { Quadrant } from '@/constants/quadrants';
import { Spacing } from '@/constants/theme';
import { useLocale } from '@/context/locale-context';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  quadrant: Quadrant;
  count: number;
  onPress: () => void;
};

export function QuadrantSummaryCard({ quadrant, count, onPress }: Props) {
  const theme = useTheme();
  const { t } = useLocale();

  return (
    <Pressable onPress={onPress} style={styles.pressable}>
      <View style={[styles.card, { backgroundColor: quadrant.color }]}>
        <ThemedText style={styles.icon}>{quadrant.icon}</ThemedText>
        <ThemedText type="smallBold" style={[styles.title, { color: theme.cardText }]} numberOfLines={2}>
          {t(quadrant.titleKey)}
        </ThemedText>
        <View style={styles.footer}>
          <ThemedText style={[styles.count, { color: theme.cardText }]}>{count}</ThemedText>
          <ThemedText style={[styles.chevron, { color: theme.cardText }]}>›</ThemedText>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    flex: 1,
  },
  card: {
    flex: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    minHeight: 118,
    justifyContent: 'space-between',
  },
  icon: {
    fontSize: 22,
  },
  title: {},
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  count: {
    fontSize: 28,
    fontWeight: '700',
  },
  chevron: {
    fontSize: 22,
    fontWeight: '700',
    opacity: 0.6,
  },
});

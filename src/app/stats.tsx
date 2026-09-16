import { Redirect } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomTabBar } from '@/components/bottom-tab-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { QUADRANTS } from '@/constants/quadrants';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useLocale } from '@/context/locale-context';
import { useTasksContext } from '@/context/tasks-context';

export default function StatsScreen() {
  const { user } = useAuth();
  const { t } = useLocale();
  const { tasks, isLoaded } = useTasksContext();

  if (!user) return <Redirect href="/login" />;

  const total = tasks.length;
  const completed = tasks.filter((task) => task.done).length;
  const active = total - completed;
  const maxCount = Math.max(1, ...QUADRANTS.map((q) => tasks.filter((task) => task.quadrantId === q.id).length));

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle" style={styles.title}>
          {t('stats.title')}
        </ThemedText>

        {isLoaded && (
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.summaryRow}>
              <ThemedView type="backgroundElement" style={styles.summaryCard}>
                <ThemedText type="title" style={styles.summaryNumber}>
                  {total}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('stats.totalTasks')}
                </ThemedText>
              </ThemedView>
              <ThemedView type="backgroundElement" style={styles.summaryCard}>
                <ThemedText type="title" style={styles.summaryNumber}>
                  {active}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('stats.active')}
                </ThemedText>
              </ThemedView>
              <ThemedView type="backgroundElement" style={styles.summaryCard}>
                <ThemedText type="title" style={styles.summaryNumber}>
                  {completed}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('stats.completed')}
                </ThemedText>
              </ThemedView>
            </View>

            <ThemedText type="smallBold" style={styles.sectionLabel}>
              {t('stats.byQuadrant')}
            </ThemedText>
            {QUADRANTS.map((quadrant) => {
              const count = tasks.filter((task) => task.quadrantId === quadrant.id).length;
              return (
                <View key={quadrant.id} style={styles.barRow}>
                  <ThemedText style={styles.barIcon}>{quadrant.icon}</ThemedText>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { backgroundColor: quadrant.color, width: `${(count / maxCount) * 100}%` },
                      ]}
                    />
                  </View>
                  <ThemedText type="smallBold" style={styles.barCount}>
                    {count}
                  </ThemedText>
                </View>
              );
            })}
          </ScrollView>
        )}

        <BottomTabBar />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  title: {
    fontSize: 22,
    marginBottom: Spacing.three,
  },
  content: {
    gap: Spacing.four,
    paddingBottom: Spacing.three,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  summaryCard: {
    flex: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    alignItems: 'center',
    gap: Spacing.half,
  },
  summaryNumber: {
    fontSize: 28,
  },
  sectionLabel: {
    marginBottom: -Spacing.two,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  barIcon: {
    fontSize: 18,
    width: 24,
  },
  barTrack: {
    flex: 1,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 6,
  },
  barCount: {
    width: 24,
    textAlign: 'right',
  },
});

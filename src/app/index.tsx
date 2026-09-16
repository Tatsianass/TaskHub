import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomTabBar } from '@/components/bottom-tab-bar';
import { QuadrantSummaryCard } from '@/components/quadrant-summary-card';
import { TaskFormModal } from '@/components/task-form-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { QUADRANTS } from '@/constants/quadrants';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useLocale } from '@/context/locale-context';
import { useTasksContext } from '@/context/tasks-context';
import type { TaskDraft } from '@/hooks/use-tasks';

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useLocale();
  const { tasks, isLoaded, addTask } = useTasksContext();
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (!user) return <Redirect href="/login" />;

  const handleSave = (draft: TaskDraft) => {
    addTask(draft);
    setIsModalOpen(false);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <View>
            <ThemedText type="subtitle" style={styles.brand}>
              {t('app.brand')}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('home.tagline')}
            </ThemedText>
          </View>
          <Pressable onPress={() => setIsModalOpen(true)} hitSlop={10}>
            <ThemedText style={styles.icon}>➕</ThemedText>
          </Pressable>
        </View>

        {isLoaded && (
          <View style={styles.grid}>
            <View style={styles.row}>
              {QUADRANTS.slice(0, 2).map((quadrant) => (
                <QuadrantSummaryCard
                  key={quadrant.id}
                  quadrant={quadrant}
                  count={tasks.filter((t2) => t2.quadrantId === quadrant.id).length}
                  onPress={() => router.push(`/quadrant/${quadrant.id}`)}
                />
              ))}
            </View>
            <View style={styles.row}>
              {QUADRANTS.slice(2, 4).map((quadrant) => (
                <QuadrantSummaryCard
                  key={quadrant.id}
                  quadrant={quadrant}
                  count={tasks.filter((t2) => t2.quadrantId === quadrant.id).length}
                  onPress={() => router.push(`/quadrant/${quadrant.id}`)}
                />
              ))}
            </View>
          </View>
        )}

        <View style={styles.spacer} />
        <BottomTabBar />
      </SafeAreaView>

      <TaskFormModal
        visible={isModalOpen}
        initialTask={null}
        defaultQuadrantId={QUADRANTS[0].id}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
      />
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
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.four,
  },
  brand: {
    fontSize: 24,
  },
  icon: {
    fontSize: 20,
  },
  grid: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  spacer: {
    flex: 1,
  },
});

import { Redirect, useRouter } from 'expo-router';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuroraBackground } from '@/components/aurora-background';
import { GlassPanel } from '@/components/glass-panel';
import { PlansPanel } from '@/components/plans-panel';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useLocale } from '@/context/locale-context';
import { usePro } from '@/context/pro-context';
import { useTheme } from '@/hooks/use-theme';
import { hexToRgba } from '@/utils/colors';
import { MAX_REMINDERS } from '@/utils/reminders';

/** A cell is a check, a dash (not included) or a short value such as a count. */
type Cell = boolean | string;

const ROWS: { key: string; free: Cell; pro: Cell }[] = [
  { key: 'tasks', free: true, pro: true },
  { key: 'smartDate', free: true, pro: true },
  { key: 'birthdays', free: true, pro: true },
  { key: 'reminders', free: '1', pro: String(MAX_REMINDERS) },
  { key: 'voice', free: false, pro: true },
  { key: 'widgets', free: false, pro: true },
  { key: 'backup', free: false, pro: true },
  { key: 'themes', free: '2', pro: '4' },
];

const MANAGE_URL =
  Platform.OS === 'ios' ? 'https://apps.apple.com/account/subscriptions' : 'https://play.google.com/store/account/subscriptions';

function CellMark({ value, highlight }: { value: Cell; highlight?: boolean }) {
  const theme = useTheme();
  if (value === false) {
    return (
      <ThemedText themeColor="textSecondary" style={styles.cellText}>
        —
      </ThemedText>
    );
  }
  return (
    <ThemedText type="smallBold" style={[styles.cellText, { color: highlight ? theme.primary : theme.text }]}>
      {value === true ? '✓' : value}
    </ThemedText>
  );
}

export default function SubscriptionScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useLocale();
  const theme = useTheme();
  const { isPro } = usePro();

  if (!user) return <Redirect href="/login" />;

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <AuroraBackground>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Pressable onPress={goBack} hitSlop={10} style={styles.back} accessibilityRole="button" accessibilityLabel={t('completed.back')}>
              <ThemedText style={[styles.chevron, { color: theme.primary }]}>‹</ThemedText>
              <ThemedText type="subtitle" style={styles.title}>
                {t('pro.title')}
              </ThemedText>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            <GlassPanel
              tintColor={isPro ? hexToRgba(theme.primary, 0.14) : undefined}
              style={isPro ? { borderColor: theme.primary } : undefined}
              contentStyle={styles.status}>
              <ThemedText type="smallBold">{isPro ? t('pro.settingsActive') : t('pro.screenHeadline')}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {isPro ? t('pro.screenActiveHint') : t('pro.settingsGetHint')}
              </ThemedText>
            </GlassPanel>

            <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
              {t('pro.compareTitle')}
            </ThemedText>
            <GlassPanel contentStyle={styles.table}>
              <View style={styles.row}>
                <View style={styles.feature} />
                <ThemedText type="small" themeColor="textSecondary" style={styles.cell}>
                  {t('pro.compare.free')}
                </ThemedText>
                <ThemedText type="smallBold" themeColor="primary" style={styles.cell}>
                  {t('pro.compare.pro')}
                </ThemedText>
              </View>
              {ROWS.map((row) => (
                <View key={row.key} style={[styles.row, styles.rowBorder, { borderTopColor: theme.glassBorder }]}>
                  <View style={styles.feature}>
                    <ThemedText type="small">{t(`pro.row.${row.key}`)}</ThemedText>
                  </View>
                  <View style={styles.cell}>
                    <CellMark value={row.free} />
                  </View>
                  <View style={[styles.cell, styles.proCell, { backgroundColor: hexToRgba(theme.primary, 0.1) }]}>
                    <CellMark value={row.pro} highlight />
                  </View>
                </View>
              ))}
            </GlassPanel>

            <PlansPanel />

            {isPro && (
              <Pressable onPress={() => Linking.openURL(MANAGE_URL)} hitSlop={8} accessibilityRole="link">
                <ThemedText type="small" themeColor="primary" style={styles.manage}>
                  {t('pro.manage')}
                </ThemedText>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </SafeAreaView>
    </AuroraBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.two },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  chevron: { fontSize: 34, lineHeight: 38 },
  title: { fontSize: 24 },
  scroll: { gap: Spacing.three, paddingTop: Spacing.two, paddingBottom: Spacing.five },
  status: { gap: Spacing.one, padding: Spacing.three },
  sectionLabel: { marginBottom: -Spacing.one, paddingHorizontal: Spacing.one },
  table: { paddingVertical: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 46 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth },
  feature: { flex: 1, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  cell: { width: 76, alignItems: 'center', justifyContent: 'center', textAlign: 'center' },
  proCell: { alignSelf: 'stretch' },
  cellText: { textAlign: 'center' },
  manage: { textAlign: 'center' },
});

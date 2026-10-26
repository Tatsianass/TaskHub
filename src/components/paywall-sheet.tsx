import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomSheetModal } from '@/components/bottom-sheet-modal';
import { GlassPanel } from '@/components/glass-panel';
import { PlansPanel } from '@/components/plans-panel';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useLocale } from '@/context/locale-context';
import { usePro } from '@/context/pro-context';
import { useTheme } from '@/hooks/use-theme';

const BENEFITS = ['voice', 'reminders', 'widgets', 'themes'] as const;

/** Slides up from anywhere in the app (see `openPaywall`) when a Pro feature is used on the free plan. */
export function PaywallSheet() {
  const { paywallFeature, closePaywall, isPro, devToggle } = usePro();
  const { t } = useLocale();
  const theme = useTheme();
  const visible = paywallFeature !== null;

  // Becoming Pro (a purchase, a restore, or the store catching up) is the end of the paywall's job.
  useEffect(() => {
    if (visible && isPro && !devToggle) closePaywall();
  }, [visible, isPro, devToggle, closePaywall]);

  return (
    <BottomSheetModal
      visible={visible}
      onClose={closePaywall}
      maxHeight="92%"
      header={
        <View style={styles.header}>
          <View style={styles.headerSide} />
          <ThemedText type="smallBold">{t('pro.title')}</ThemedText>
          <Pressable
            onPress={closePaywall}
            hitSlop={8}
            accessibilityRole="button"
            style={[styles.close, { borderColor: theme.glassBorder, backgroundColor: theme.glassBg }]}>
            <ThemedText style={styles.closeIcon}>✕</ThemedText>
          </Pressable>
        </View>
      }>
      <SafeAreaView edges={['bottom']} style={styles.fit}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <ThemedText type="subtitle" style={styles.headline}>
            {t(`pro.why.${paywallFeature ?? 'general'}`)}
          </ThemedText>

          <GlassPanel contentStyle={styles.benefits}>
            {BENEFITS.map((benefit) => (
              <View key={benefit} style={styles.benefit}>
                <ThemedText themeColor="primary">✓</ThemedText>
                <ThemedText type="small" style={styles.benefitText}>
                  {t(`pro.benefit.${benefit}`)}
                </ThemedText>
              </View>
            ))}
          </GlassPanel>

          {/* Only mounted while the sheet is open, so every opening starts from a clean selection. */}
          <PlansPanel />
        </ScrollView>
      </SafeAreaView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  fit: { flexShrink: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingVertical: Spacing.three },
  headerSide: { width: 32 },
  close: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  closeIcon: { fontSize: 13, lineHeight: 16 },
  body: { gap: Spacing.three, paddingHorizontal: Spacing.three, paddingBottom: Spacing.three },
  headline: { textAlign: 'center' },
  benefits: { gap: Spacing.two, padding: Spacing.three },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  benefitText: { flex: 1 },
});

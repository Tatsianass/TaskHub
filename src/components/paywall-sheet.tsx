import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PurchasesPackage } from 'react-native-purchases';

import { BottomSheetModal } from '@/components/bottom-sheet-modal';
import { GlassPanel } from '@/components/glass-panel';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useLocale } from '@/context/locale-context';
import { usePro } from '@/context/pro-context';
import { PRIVACY_URL, TERMS_URL } from '@/lib/config';
import { useTheme } from '@/hooks/use-theme';
import { hexToRgba } from '@/utils/colors';

const BENEFITS = ['voice', 'reminders', 'widgets', 'backup', 'themes'] as const;

/** Length of the free trial on this package, when it has one. */
function trialDays(pkg: PurchasesPackage): number | null {
  const intro = pkg.product.introPrice;
  if (!intro || intro.price !== 0) return null;
  if (intro.periodUnit === 'DAY') return intro.periodNumberOfUnits * intro.cycles;
  if (intro.periodUnit === 'WEEK') return intro.periodNumberOfUnits * intro.cycles * 7;
  return null;
}

/** Slides up from anywhere in the app (see `openPaywall`) when a Pro feature is used on the free plan. */
export function PaywallSheet() {
  const { paywallFeature, closePaywall, isPro, storeAvailable, packages, purchase, restore, devToggle } = usePro();
  const { t } = useLocale();
  const theme = useTheme();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const visible = paywallFeature !== null;

  // Becoming Pro (a purchase, a restore, or the store catching up) is the end of the paywall's job.
  useEffect(() => {
    if (visible && isPro && !devToggle) closePaywall();
  }, [visible, isPro, devToggle, closePaywall]);

  const close = () => {
    setMessage(null);
    setSelectedId(null);
    closePaywall();
  };

  // Until the user picks one, the yearly plan is selected: it's the one the trial and the best price are on.
  const preferred = packages.find((pkg) => pkg.packageType === 'ANNUAL') ?? packages[0] ?? null;
  const selected = packages.find((pkg) => pkg.identifier === selectedId) ?? preferred;
  const days = selected ? trialDays(selected) : null;
  const storeName = Platform.OS === 'ios' ? 'App Store' : 'Google Play';

  const planName = (pkg: PurchasesPackage) =>
    pkg.packageType === 'ANNUAL'
      ? t('pro.plan.annual')
      : pkg.packageType === 'MONTHLY'
        ? t('pro.plan.monthly')
        : pkg.packageType === 'LIFETIME'
          ? t('pro.plan.lifetime')
          : pkg.product.title;

  const handleBuy = async () => {
    if (!selected) return;
    setBusy('buy');
    setMessage(null);
    const outcome = await purchase(selected);
    setBusy(null);
    if (outcome === 'failed') setMessage(t('pro.purchaseFailed'));
  };

  const handleRestore = async () => {
    setBusy('restore');
    setMessage(null);
    const found = await restore();
    setBusy(null);
    if (!found) setMessage(t('pro.nothingToRestore'));
  };

  return (
    <BottomSheetModal
      visible={visible}
      onClose={close}
      maxHeight="92%"
      header={
        <View style={styles.header}>
          <View style={styles.headerSide} />
          <ThemedText type="smallBold">{t('pro.title')}</ThemedText>
          <Pressable
            onPress={close}
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
                <ThemedText type="small" style={styles.flex}>
                  {t(`pro.benefit.${benefit}`)}
                </ThemedText>
              </View>
            ))}
          </GlassPanel>

          {packages.length > 0 ? (
            <View style={styles.plans}>
              {packages.map((pkg) => {
                const active = pkg.identifier === selected?.identifier;
                const planTrial = trialDays(pkg);
                return (
                  <Pressable
                    key={pkg.identifier}
                    onPress={() => setSelectedId(pkg.identifier)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    style={[
                      styles.plan,
                      { borderColor: theme.glassBorder, backgroundColor: theme.glassBg },
                      active && { borderColor: theme.primary, backgroundColor: hexToRgba(theme.primary, 0.14) },
                    ]}>
                    <View style={styles.flex}>
                      <ThemedText type="smallBold">{planName(pkg)}</ThemedText>
                      {planTrial !== null && (
                        <ThemedText type="small" themeColor="primary">
                          {t('pro.trialDays', { days: planTrial })}
                        </ThemedText>
                      )}
                    </View>
                    <ThemedText type="smallBold">{pkg.product.priceString}</ThemedText>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
              {t(storeAvailable ? 'pro.loading' : 'pro.storeUnavailable')}
            </ThemedText>
          )}

          {!!message && (
            <ThemedText type="small" style={[styles.centered, { color: theme.danger }]}>
              {message}
            </ThemedText>
          )}

          {selected && (
            <PrimaryButton
              title={days !== null ? t('pro.startTrial', { days }) : t('pro.continue')}
              onPress={handleBuy}
              loading={busy === 'buy'}
              disabled={busy !== null}
            />
          )}

          {selected && selected.packageType !== 'LIFETIME' && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
              {days !== null
                ? t('pro.termsTrial', { days, price: selected.product.priceString, store: storeName })
                : t('pro.terms', { price: selected.product.priceString, store: storeName })}
            </ThemedText>
          )}

          {devToggle && (
            <PrimaryButton
              variant="ghost"
              title={isPro ? 'DEV: Pro → off' : 'DEV: Pro → on'}
              onPress={() => {
                devToggle();
                closePaywall();
              }}
            />
          )}

          <View style={styles.links}>
            <Pressable onPress={handleRestore} disabled={busy !== null || !storeAvailable} hitSlop={8}>
              <ThemedText type="small" themeColor="primary">
                {busy === 'restore' ? t('pro.restoring') : t('pro.restore')}
              </ThemedText>
            </Pressable>
            <Pressable onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)} hitSlop={8}>
              <ThemedText type="small" themeColor="textSecondary">
                {t('pro.termsLink')}
              </ThemedText>
            </Pressable>
            {!!PRIVACY_URL && (
              <Pressable onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)} hitSlop={8}>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('pro.privacyLink')}
                </ThemedText>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fit: { flexShrink: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingVertical: Spacing.three },
  headerSide: { width: 32 },
  close: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  closeIcon: { fontSize: 13, lineHeight: 16 },
  body: { gap: Spacing.three, paddingHorizontal: Spacing.three, paddingBottom: Spacing.three },
  headline: { textAlign: 'center' },
  centered: { textAlign: 'center' },
  benefits: { gap: Spacing.two, padding: Spacing.three },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  plans: { gap: Spacing.two },
  plan: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 1, borderRadius: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three - 4 },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.three },
});

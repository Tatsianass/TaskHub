import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuroraBackground } from '@/components/aurora-background';
import { GlassPanel } from '@/components/glass-panel';
import { PlansPanel } from '@/components/plans-panel';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useLocale } from '@/context/locale-context';

const BENEFITS = ['voice', 'reminders', 'widgets', 'themes'] as const;

/**
 * Shown in place of the app until the user starts the free trial or subscribes (see the guard in
 * the root layout). It can't be dismissed: the only ways out are buying, restoring, or signing out.
 */
export default function PaywallScreen() {
  const { t } = useLocale();
  const { logout, isLocal } = useAuth();

  return (
    <AuroraBackground>
      <SafeAreaView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <ThemedText type="title" style={styles.brand}>
              {t('app.brand')}
            </ThemedText>
            <ThemedText type="subtitle" style={styles.headline}>
              {t('pro.why.general')}
            </ThemedText>
          </View>

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

          <PlansPanel />

          {!isLocal && (
            <Pressable onPress={() => logout()} hitSlop={8} accessibilityRole="button">
              <ThemedText type="small" themeColor="textSecondary" style={styles.signOut}>
                {t('settings.logout')}
              </ThemedText>
            </Pressable>
          )}
        </ScrollView>
      </SafeAreaView>
    </AuroraBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { flexGrow: 1, justifyContent: 'center', gap: Spacing.four, padding: Spacing.four },
  hero: { alignItems: 'center', gap: Spacing.two },
  brand: { fontSize: 36 },
  headline: { textAlign: 'center' },
  benefits: { gap: Spacing.two, padding: Spacing.three },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  signOut: { textAlign: 'center' },
});

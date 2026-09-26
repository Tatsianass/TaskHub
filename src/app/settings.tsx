import { Redirect, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuroraBackground } from '@/components/aurora-background';
import { BottomTabBar } from '@/components/bottom-tab-bar';
import { GlassPanel } from '@/components/glass-panel';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import type { ThemeMode } from '@/constants/theme';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useLocale } from '@/context/locale-context';
import { useThemeMode } from '@/context/theme-mode-context';
import { useTheme } from '@/hooks/use-theme';
import { LOCALES } from '@/i18n/translations';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { t, locale, setLocale } = useLocale();
  const { mode, setMode } = useThemeMode();
  const theme = useTheme();

  if (!user) return <Redirect href="/login" />;

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const themeOptions: { value: ThemeMode; label: string }[] = [
    { value: 'dark', label: t('settings.themeDark') },
    { value: 'light', label: t('settings.themeLight') },
  ];

  return (
    <AuroraBackground>
      <SafeAreaView style={styles.safeArea}>
      <View style={styles.inner}>
        <ThemedText type="subtitle" style={styles.title}>
          {t('settings.title')}
        </ThemedText>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <GlassPanel contentStyle={styles.card}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('settings.account')}
            </ThemedText>
            <ThemedText type="smallBold">{user.email}</ThemedText>
          </GlassPanel>

          <View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
              {t('settings.theme')}
            </ThemedText>
            <View style={styles.chipRow}>
              {themeOptions.map((option) => (
                <Pressable key={option.value} onPress={() => setMode(option.value)} style={styles.chipWrapper}>
                  <GlassPanel
                    contentStyle={styles.chipContent}
                    tintColor={mode === option.value ? theme.glassBgStrong : theme.glassBg}
                    style={mode === option.value ? { borderColor: theme.primary } : undefined}>
                    <ThemedText type="small" themeColor={mode === option.value ? 'primary' : 'text'}>
                      {option.label}
                    </ThemedText>
                  </GlassPanel>
                </Pressable>
              ))}
            </View>
          </View>

          <View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
              {t('settings.language')}
            </ThemedText>
            <View style={styles.chipRow}>
              {LOCALES.map((item) => (
                <Pressable key={item.code} onPress={() => setLocale(item.code)} style={styles.chipWrapper}>
                  <GlassPanel
                    contentStyle={styles.chipContent}
                    tintColor={item.code === locale ? theme.glassBgStrong : theme.glassBg}
                    style={item.code === locale ? { borderColor: theme.primary } : undefined}>
                    <ThemedText type="small" themeColor={item.code === locale ? 'primary' : 'text'}>
                      {item.nativeLabel}
                    </ThemedText>
                  </GlassPanel>
                </Pressable>
              ))}
            </View>
          </View>

          <PrimaryButton title={t('settings.logout')} onPress={handleLogout} variant="danger" />
        </ScrollView>

        <BottomTabBar />
      </View>
      </SafeAreaView>
    </AuroraBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  inner: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  title: {
    fontSize: 22,
    marginBottom: Spacing.three,
  },
  content: {
    gap: Spacing.four,
    paddingBottom: Spacing.three,
  },
  card: {
    padding: Spacing.three,
    gap: Spacing.one,
  },
  sectionLabel: {
    marginBottom: Spacing.two,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chipWrapper: {
    flexShrink: 0,
  },
  chipContent: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});

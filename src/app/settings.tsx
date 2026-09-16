import { Redirect, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomTabBar } from '@/components/bottom-tab-bar';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useLocale } from '@/context/locale-context';
import { useTheme } from '@/hooks/use-theme';
import { LOCALES } from '@/i18n/translations';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { t, locale, setLocale } = useLocale();
  const theme = useTheme();

  if (!user) return <Redirect href="/login" />;

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle" style={styles.title}>
          {t('settings.title')}
        </ThemedText>

        <ScrollView contentContainerStyle={styles.content}>
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('settings.account')}
            </ThemedText>
            <ThemedText type="smallBold">{user.email}</ThemedText>
          </ThemedView>

          <View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
              {t('settings.language')}
            </ThemedText>
            <View style={styles.languageGrid}>
              {LOCALES.map((item) => (
                <Pressable
                  key={item.code}
                  onPress={() => setLocale(item.code)}
                  style={[styles.languageChip, item.code === locale && { borderColor: theme.primary }]}>
                  <ThemedText
                    type="small"
                    themeColor={item.code === locale ? 'primary' : 'text'}>
                    {item.nativeLabel}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </View>

          <Pressable onPress={() => router.push('/birthdays')}>
            <ThemedView type="backgroundElement" style={styles.linkRow}>
              <ThemedText type="smallBold">🎂 {t('settings.birthdays')}</ThemedText>
              <ThemedText themeColor="textSecondary">›</ThemedText>
            </ThemedView>
          </Pressable>

          <PrimaryButton title={t('settings.logout')} onPress={handleLogout} variant="danger" />
        </ScrollView>

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
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  sectionLabel: {
    marginBottom: Spacing.two,
  },
  languageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  languageChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.four,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
});

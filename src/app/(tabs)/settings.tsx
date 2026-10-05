import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Switch, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DropdownField } from '@/components/dropdown-field';
import { GlassPanel } from '@/components/glass-panel';
import { InfoButton } from '@/components/info-button';
import { PrimaryButton } from '@/components/primary-button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { QUADRANTS } from '@/constants/quadrants';
import type { ThemeMode } from '@/constants/theme';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useEscalationSettings } from '@/context/escalation-context';
import { useNotificationsSettings } from '@/context/notifications-context';
import { useLocale } from '@/context/locale-context';
import { useThemeMode } from '@/context/theme-mode-context';
import { useTheme } from '@/hooks/use-theme';
import { LOCALES } from '@/i18n/translations';

const ESCALATION_PRESETS: { key: string; days: number | null }[] = [
  { key: 'off', days: null },
  { key: '1', days: 1 },
  { key: '3', days: 3 },
  { key: '7', days: 7 },
  { key: '14', days: 14 },
];

const quadrant = (id: string) => QUADRANTS.find((q) => q.id === id)!;

/** The moves deadline escalation makes, matching URGENT_COUNTERPART in utils/priority. */
const ESCALATION_MOVES = [
  [quadrant('not-urgent-important'), quadrant('urgent-important')],
  [quadrant('not-urgent-not-important'), quadrant('urgent-not-important')],
] as const;

export default function SettingsScreen() {
  const router = useRouter();
  const { user, logout, isLocal } = useAuth();
  const { t, locale, setLocale } = useLocale();
  const { mode, setMode } = useThemeMode();
  const { escalationDays, setEscalationDays } = useEscalationSettings();
  const { notificationsEnabled, setNotificationsEnabled } = useNotificationsSettings();
  const [notificationsDenied, setNotificationsDenied] = useState(false);
  const theme = useTheme();

  const isCustomEscalation = escalationDays !== null && !ESCALATION_PRESETS.some((p) => p.days === escalationDays);
  const [customInputForced, setCustomInputForced] = useState(false);
  const [customEscalationText, setCustomEscalationText] = useState('');
  const showCustomEscalation = isCustomEscalation || customInputForced;

  // Keep the text field in sync once the persisted custom value finishes loading
  // (it starts out null before AsyncStorage resolves, then jumps straight to its real value).
  useEffect(() => {
    if (isCustomEscalation) setCustomEscalationText(String(escalationDays));
  }, [escalationDays, isCustomEscalation]);

  if (!user) return <Redirect href="/login" />;

  const handleNotificationsToggle = async (enabled: boolean) => {
    setNotificationsDenied(!(await setNotificationsEnabled(enabled)));
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const handleCustomEscalationChange = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '').slice(0, 3);
    setCustomEscalationText(digits);
    const parsed = Number(digits);
    if (digits && parsed > 0) setEscalationDays(parsed);
  };

  const escalationDropdownKey = showCustomEscalation
    ? 'custom'
    : (ESCALATION_PRESETS.find((p) => p.days === escalationDays)?.key ?? 'off');

  const escalationDropdownOptions = [
    ...ESCALATION_PRESETS.map((p) => ({
      value: p.key,
      label: p.days === null ? t('settings.escalationOff') : t('settings.escalationDays', { n: p.days }),
    })),
    { value: 'custom', label: t('settings.escalationCustom') },
  ];

  const handleEscalationSelect = (key: string) => {
    if (key === 'custom') {
      setCustomInputForced(true);
      return;
    }
    setCustomInputForced(false);
    const preset = ESCALATION_PRESETS.find((p) => p.key === key);
    setEscalationDays(preset ? preset.days : null);
  };

  const themeOptions: { value: ThemeMode; label: string }[] = [
    { value: 'dark', label: t('settings.themeDark') },
    { value: 'light', label: t('settings.themeLight') },
    { value: 'coral', label: t('settings.themeCoral') },
    { value: 'emerald', label: t('settings.themeEmerald') },
  ];

  return (
    <>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.inner}>
        <ThemedText type="subtitle" style={styles.title}>
          {t('settings.title')}
        </ThemedText>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {!isLocal && (
            <GlassPanel contentStyle={styles.card}>
              <ThemedText type="small" themeColor="textSecondary">
                {t('settings.account')}
              </ThemedText>
              <ThemedText type="smallBold">{user.email}</ThemedText>
            </GlassPanel>
          )}

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
            <DropdownField
              value={locale}
              options={LOCALES.map((item) => ({ value: item.code, label: item.nativeLabel }))}
              onSelect={(code) => {
                const next = LOCALES.find((item) => item.code === code);
                if (next) setLocale(next.code);
              }}
            />
          </View>

          <View>
            <View style={[styles.sectionLabel, styles.labelRow]}>
              <ThemedText type="small" themeColor="textSecondary">
                {t('settings.escalationTitle')}
              </ThemedText>
              <InfoButton
                accessibilityLabel={t('escalationInfo.a11y')}
                title={t('escalationInfo.title')}
                closeLabel={t('escalationInfo.ok')}>
                <ThemedText>{t('escalationInfo.intro')}</ThemedText>
                <GlassPanel contentStyle={styles.moves}>
                  {ESCALATION_MOVES.map(([from, to]) => (
                    <ThemedText key={from.id} type="smallBold">
                      {from.icon} {t(from.shortLabelKey)}  →  {to.icon} {t(to.shortLabelKey)}
                    </ThemedText>
                  ))}
                </GlassPanel>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('escalationInfo.same')}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('escalationInfo.example', { urgent: t(QUADRANTS[0].shortLabelKey) })}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('escalationInfo.revert')}
                </ThemedText>
              </InfoButton>
            </View>
            <DropdownField
              value={escalationDropdownKey}
              options={escalationDropdownOptions}
              onSelect={handleEscalationSelect}
            />
            {showCustomEscalation && (
              <TextField
                value={customEscalationText}
                onChangeText={handleCustomEscalationChange}
                placeholder={t('settings.escalationCustomPlaceholder')}
                keyboardType="numeric"
                style={styles.customEscalationInput}
              />
            )}
            <ThemedText type="small" themeColor="textSecondary" style={styles.escalationHint}>
              {t('settings.escalationHint')}
            </ThemedText>
          </View>

          <GlassPanel contentStyle={styles.switchRow}>
            <View style={styles.switchText}>
              <ThemedText type="smallBold">{t('settings.notifications')}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {notificationsDenied ? t('settings.notificationsDenied') : t('settings.notificationsHint')}
              </ThemedText>
            </View>
            <Switch value={notificationsEnabled} onValueChange={handleNotificationsToggle} />
          </GlassPanel>

          {!isLocal && <PrimaryButton title={t('settings.logout')} onPress={handleLogout} variant="danger" />}
        </ScrollView>
      </View>
      </SafeAreaView>
    </>
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  switchText: {
    flex: 1,
    gap: Spacing.one,
  },
  sectionLabel: {
    marginBottom: Spacing.two,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  moves: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  escalationHint: {
    marginTop: Spacing.two,
  },
  customEscalationInput: {
    marginTop: Spacing.two,
    maxWidth: 160,
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

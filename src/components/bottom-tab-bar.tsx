import { usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { GlassPanel } from '@/components/glass-panel';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useLocale } from '@/context/locale-context';
import { useTheme } from '@/hooks/use-theme';

const TABS = [
  { href: '/', icon: '📋', labelKey: 'tabs.tasks' },
  { href: '/calendar', icon: '📅', labelKey: 'tabs.calendar' },
  { href: '/birthdays', icon: '🎂', labelKey: 'settings.birthdays' },
  { href: '/settings', icon: '⚙️', labelKey: 'tabs.settings' },
] as const;

export function BottomTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useLocale();
  const theme = useTheme();

  return (
    <GlassPanel style={styles.outer} contentStyle={styles.bar}>
      {TABS.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Pressable
            key={tab.href}
            style={[styles.tab, isActive && styles.tabActive]}
            accessibilityRole="tab"
            accessibilityLabel={t(tab.labelKey)}
            accessibilityState={{ selected: isActive }}
            onPress={() => {
              if (!isActive) router.replace(tab.href);
            }}>
            <View style={[styles.tabInner, isActive && { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText style={styles.icon}>{tab.icon}</ThemedText>
              {/* Only the active tab spells out its name, so labels of any length
                  ("Дни рождения", "Einstellungen") fit on one line in every language. */}
              {isActive && (
                <ThemedText
                  type="smallBold"
                  themeColor="primary"
                  style={styles.label}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}>
                  {t(tab.labelKey)}
                </ThemedText>
              )}
            </View>
          </Pressable>
        );
      })}
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  outer: {
    borderRadius: Spacing.four,
  },
  bar: {
    flexDirection: 'row',
    gap: Spacing.one,
    padding: Spacing.one,
  },
  tab: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  tabActive: {
    // The active pill sizes to its label; the icon-only tabs share what's left.
    flexGrow: 0,
    flexBasis: 'auto',
  },
  tabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 48,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
  },
  icon: {
    fontSize: 20,
    lineHeight: 26,
  },
  label: {
    flexShrink: 1,
  },
});

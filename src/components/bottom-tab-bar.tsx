import { usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useLocale } from '@/context/locale-context';
import { useTheme } from '@/hooks/use-theme';

const TABS = [
  { href: '/', icon: '📋', labelKey: 'tabs.tasks' },
  { href: '/calendar', icon: '📅', labelKey: 'tabs.calendar' },
  { href: '/stats', icon: '📊', labelKey: 'tabs.stats' },
  { href: '/settings', icon: '⚙️', labelKey: 'tabs.settings' },
] as const;

export function BottomTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useLocale();
  const theme = useTheme();

  return (
    <View style={[styles.bar, { borderTopColor: theme.border }]}>
      {TABS.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Pressable
            key={tab.href}
            style={styles.tab}
            onPress={() => {
              if (!isActive) router.replace(tab.href);
            }}>
            <ThemedText style={styles.icon}>{tab.icon}</ThemedText>
            <ThemedText type="small" themeColor={isActive ? 'primary' : 'textSecondary'}>
              {t(tab.labelKey)}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: Spacing.two,
    marginTop: Spacing.two,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  icon: {
    fontSize: 20,
  },
});

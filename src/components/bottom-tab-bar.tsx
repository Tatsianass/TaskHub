import { usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { GlassPanel } from '@/components/glass-panel';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useLocale } from '@/context/locale-context';

const TABS = [
  { href: '/', icon: '📋', labelKey: 'tabs.tasks' },
  { href: '/calendar', icon: '📅', labelKey: 'tabs.calendar' },
  { href: '/settings', icon: '⚙️', labelKey: 'tabs.settings' },
] as const;

export function BottomTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useLocale();

  return (
    <GlassPanel style={styles.outer} contentStyle={styles.bar}>
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
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  outer: {
    borderRadius: Spacing.four,
  },
  bar: {
    flexDirection: 'row',
    paddingVertical: Spacing.two,
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

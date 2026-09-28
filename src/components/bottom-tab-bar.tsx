import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassPanel } from '@/components/glass-panel';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useLocale } from '@/context/locale-context';
import { useTheme } from '@/hooks/use-theme';

// Keyed by route name in src/app/(tabs); order follows the navigator.
const TABS = {
  index: { icon: '📋', labelKey: 'tabs.tasks' },
  calendar: { icon: '📅', labelKey: 'tabs.calendar' },
  birthdays: { icon: '🎂', labelKey: 'settings.birthdays' },
  settings: { icon: '⚙️', labelKey: 'tabs.settings' },
} as const;


export function BottomTabBar({ state, navigation }: BottomTabBarProps) {
  const { t } = useLocale();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrapper, { paddingBottom: insets.bottom + Spacing.two }]}>
      <GlassPanel style={styles.outer} contentStyle={styles.bar}>
        {state.routes.map((route, index) => {
          const tab = TABS[route.name as keyof typeof TABS];
          if (!tab) return null;
          const isActive = state.index === index;
          return (
            <Pressable
              // Remount on (de)activation: iOS doesn't re-apply flexBasis 'auto' -> 0 on an
              // existing view, so the previously active tab would keep its wide pill size.
              key={`${route.key}-${isActive}`}
              style={[styles.tab, isActive && styles.tabActive]}
              accessibilityRole="tab"
              accessibilityLabel={t(tab.labelKey)}
              accessibilityState={{ selected: isActive }}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!isActive && !event.defaultPrevented) navigation.navigate(route.name);
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: Spacing.four,
  },
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

import { Tabs } from 'expo-router';

import { AuroraBackground } from '@/components/aurora-background';
import { BottomTabBar } from '@/components/bottom-tab-bar';

// One shared background and a tab bar that stays put: switching tabs only
// cross-fades the content, and each tab keeps its state (scroll position,
// selected quadrant) while you're on another one.
export default function TabsLayout() {
  return (
    <AuroraBackground>
      <Tabs
        tabBar={(props) => <BottomTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          sceneStyle: { backgroundColor: 'transparent' },
        }}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="calendar" />
        <Tabs.Screen name="birthdays" />
        <Tabs.Screen name="settings" />
      </Tabs>
    </AuroraBackground>
  );
}

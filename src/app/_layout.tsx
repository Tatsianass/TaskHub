import { DarkTheme, DefaultTheme, SplashScreen, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider, useAuth } from '@/context/auth-context';
import { BirthdaysProvider } from '@/context/birthdays-context';
import { EscalationProvider } from '@/context/escalation-context';
import { ProProvider } from '@/context/pro-context';
import { NotificationsProvider } from '@/context/notifications-context';
import { LocaleProvider } from '@/context/locale-context';
import { TasksProvider } from '@/context/tasks-context';
import { useTheme } from '@/hooks/use-theme';
import { useWidgetSync } from '@/hooks/use-widget-sync';
import { ThemeModeProvider } from '@/context/theme-mode-context';
import { TodayProvider } from '@/context/today-context';

SplashScreen.preventAutoHideAsync();

function Navigation() {
  const theme = useTheme();
  const { user, isLoading } = useAuth();
  useWidgetSync();

  // Keep the splash up until we know whether a saved session is still valid,
  // so a signed-in user never flashes the login screen.
  useEffect(() => {
    if (!isLoading) SplashScreen.hide();
  }, [isLoading]);
  if (isLoading) return null;

  return (
    <ThemeProvider value={theme.scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!!user}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="completed" />
          <Stack.Screen name="subscription" />
        </Stack.Protected>
        <Stack.Protected guard={!user}>
          <Stack.Screen name="login" />
          <Stack.Screen name="register" />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <TodayProvider>
        <ThemeModeProvider>
          <LocaleProvider>
            <ProProvider>
            <AuthProvider>
              <EscalationProvider>
                <TasksProvider>
                  <BirthdaysProvider>
                    <NotificationsProvider>
                      <Navigation />
                    </NotificationsProvider>
                  </BirthdaysProvider>
                </TasksProvider>
              </EscalationProvider>
            </AuthProvider>
            </ProProvider>
          </LocaleProvider>
        </ThemeModeProvider>
      </TodayProvider>
    </GestureHandlerRootView>
  );
}

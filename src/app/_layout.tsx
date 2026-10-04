import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider } from '@/context/auth-context';
import { BirthdaysProvider } from '@/context/birthdays-context';
import { EscalationProvider } from '@/context/escalation-context';
import { NotificationsProvider } from '@/context/notifications-context';
import { LocaleProvider } from '@/context/locale-context';
import { TasksProvider } from '@/context/tasks-context';
import { useTheme } from '@/hooks/use-theme';
import { ThemeModeProvider } from '@/context/theme-mode-context';
import { TodayProvider } from '@/context/today-context';

function Navigation() {
  const theme = useTheme();
  return (
    <ThemeProvider value={theme.scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <TodayProvider>
        <ThemeModeProvider>
          <LocaleProvider>
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
          </LocaleProvider>
        </ThemeModeProvider>
      </TodayProvider>
    </GestureHandlerRootView>
  );
}

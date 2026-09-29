import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider } from '@/context/auth-context';
import { BirthdaysProvider } from '@/context/birthdays-context';
import { EscalationProvider } from '@/context/escalation-context';
import { LocaleProvider } from '@/context/locale-context';
import { TasksProvider } from '@/context/tasks-context';
import { ThemeModeProvider, useThemeMode } from '@/context/theme-mode-context';
import { TodayProvider } from '@/context/today-context';

function Navigation() {
  const { mode } = useThemeMode();
  return (
    <ThemeProvider value={mode === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
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
                    <Navigation />
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

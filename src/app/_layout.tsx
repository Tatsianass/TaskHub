import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider } from '@/context/auth-context';
import { LocaleProvider } from '@/context/locale-context';
import { TasksProvider } from '@/context/tasks-context';
import { ThemeModeProvider, useThemeMode } from '@/context/theme-mode-context';

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
      <ThemeModeProvider>
        <LocaleProvider>
          <AuthProvider>
            <TasksProvider>
              <Navigation />
            </TasksProvider>
          </AuthProvider>
        </LocaleProvider>
      </ThemeModeProvider>
    </GestureHandlerRootView>
  );
}

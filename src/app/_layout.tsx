import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider } from '@/context/auth-context';
import { LocaleProvider } from '@/context/locale-context';
import { TasksProvider } from '@/context/tasks-context';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <LocaleProvider>
        <AuthProvider>
          <TasksProvider>
            <ThemeProvider value={DarkTheme}>
              <StatusBar style="light" />
              <Stack screenOptions={{ headerShown: false }} />
            </ThemeProvider>
          </TasksProvider>
        </AuthProvider>
      </LocaleProvider>
    </GestureHandlerRootView>
  );
}

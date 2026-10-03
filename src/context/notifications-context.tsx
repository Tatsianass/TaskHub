import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { useAuth } from '@/context/auth-context';
import { useBirthdaysContext } from '@/context/birthdays-context';
import { useLocale } from '@/context/locale-context';
import { useTasksContext } from '@/context/tasks-context';
import { cancelAllReminders, ensureNotificationPermission, syncReminders } from '@/lib/notifications';

const NOTIFICATIONS_KEY = 'settings:notificationsEnabled';

type NotificationsContextValue = {
  notificationsEnabled: boolean;
  /** Turning on asks for OS permission; resolves to false if it was denied. */
  setNotificationsEnabled: (enabled: boolean) => Promise<boolean>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { t } = useLocale();
  const { tasks, isLoaded: tasksLoaded } = useTasksContext();
  const { birthdays, isLoaded: birthdaysLoaded } = useBirthdaysContext();
  const [notificationsEnabled, setEnabledState] = useState(true);
  const [prefLoaded, setPrefLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(NOTIFICATIONS_KEY)
      .then((saved) => {
        if (saved !== null) setEnabledState(saved === 'true');
      })
      .catch(() => {})
      .finally(() => setPrefLoaded(true));
  }, []);

  // Reminders belong to the signed-in user, so they are only scheduled while signed in and
  // enabled, and rebuilt whenever the tasks, birthdays or language change.
  useEffect(() => {
    if (!prefLoaded) return;
    if (!user || !notificationsEnabled) {
      cancelAllReminders().catch(() => {});
      return;
    }
    if (!tasksLoaded || !birthdaysLoaded) return;
    let cancelled = false;
    ensureNotificationPermission()
      .then((granted) => {
        if (granted && !cancelled) return syncReminders(tasks, birthdays, t);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [prefLoaded, user, notificationsEnabled, tasksLoaded, birthdaysLoaded, tasks, birthdays, t]);

  const setNotificationsEnabled = useCallback(async (enabled: boolean) => {
    if (enabled && !(await ensureNotificationPermission())) return false;
    setEnabledState(enabled);
    AsyncStorage.setItem(NOTIFICATIONS_KEY, String(enabled)).catch(() => {});
    return true;
  }, []);

  return (
    <NotificationsContext.Provider value={{ notificationsEnabled, setNotificationsEnabled }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotificationsSettings() {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error('useNotificationsSettings must be used within a NotificationsProvider');
  return context;
}

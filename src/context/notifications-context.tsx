import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import { useAuth } from '@/context/auth-context';
import { useBirthdaysContext } from '@/context/birthdays-context';
import { useLocale } from '@/context/locale-context';
import { useTasksContext } from '@/context/tasks-context';
import {
  addSnooze,
  cancelAllReminders,
  ensureNotificationPermission,
  resolveAction,
  syncReminders,
} from '@/lib/notifications';
import { DEFAULT_REMIND_TIME } from '@/utils/reminders';

const NOTIFICATIONS_KEY = 'settings:notificationsEnabled';
const MORNING_TIME_KEY = 'settings:morningTime';
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

type NotificationsContextValue = {
  notificationsEnabled: boolean;
  /** Turning on asks for OS permission; resolves to false if it was denied. */
  setNotificationsEnabled: (enabled: boolean) => Promise<boolean>;
  /** HH:mm at which alerts of tasks without their own time go off. */
  morningTime: string;
  setMorningTime: (time: string) => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

/**
 * Buttons on a task notification: tick it off, or push it to later. Handled once data is ready, since
 * tapping one from a killed app launches us first. Native only: the hook has no web implementation.
 */
function NotificationActions({ morningTime }: { morningTime: string }) {
  const { user } = useAuth();
  const { t } = useLocale();
  const { tasks, isLoaded: tasksLoaded, toggleTask } = useTasksContext();
  const { birthdays } = useBirthdaysContext();
  const response = Notifications.useLastNotificationResponse();
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!response || !user || !tasksLoaded) return;
    const key = `${response.notification.request.identifier}:${response.actionIdentifier}:${response.notification.date}`;
    if (handledRef.current === key) return;
    handledRef.current = key;
    const taskId = response.notification.request.content.data?.taskId;
    const action = resolveAction(response.actionIdentifier, new Date(), morningTime);
    const task = typeof taskId === 'string' ? tasks.find((item) => item.id === taskId) : undefined;
    if (!action || !task || task.done) return;
    if (action.type === 'done') {
      toggleTask(task.id);
    } else {
      addSnooze(task.id, action.at)
        .then(() => syncReminders(tasks, birthdays, t, morningTime))
        .catch(() => {});
    }
  }, [response, user, tasksLoaded, tasks, birthdays, t, morningTime, toggleTask]);

  return null;
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { t } = useLocale();
  const { tasks, isLoaded: tasksLoaded } = useTasksContext();
  const { birthdays, isLoaded: birthdaysLoaded } = useBirthdaysContext();
  const [notificationsEnabled, setEnabledState] = useState(true);
  const [morningTime, setMorningTimeState] = useState(DEFAULT_REMIND_TIME);
  const [prefLoaded, setPrefLoaded] = useState(false);
  // Bumped when the app returns to the foreground so the schedule is rebuilt from the current clock.
  const [resumes, setResumes] = useState(0);

  useEffect(() => {
    Promise.all([AsyncStorage.getItem(NOTIFICATIONS_KEY), AsyncStorage.getItem(MORNING_TIME_KEY)])
      .then(([enabled, morning]) => {
        if (enabled !== null) setEnabledState(enabled === 'true');
        if (morning && TIME_PATTERN.test(morning)) setMorningTimeState(morning);
      })
      .catch(() => {})
      .finally(() => setPrefLoaded(true));
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setResumes((count) => count + 1);
    });
    return () => subscription.remove();
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
        if (granted && !cancelled) return syncReminders(tasks, birthdays, t, morningTime);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [prefLoaded, user, notificationsEnabled, tasksLoaded, birthdaysLoaded, tasks, birthdays, t, morningTime, resumes]);

  const setNotificationsEnabled = useCallback(async (enabled: boolean) => {
    if (enabled && !(await ensureNotificationPermission())) return false;
    setEnabledState(enabled);
    AsyncStorage.setItem(NOTIFICATIONS_KEY, String(enabled)).catch(() => {});
    return true;
  }, []);

  const setMorningTime = useCallback((time: string) => {
    if (!TIME_PATTERN.test(time)) return;
    setMorningTimeState(time);
    AsyncStorage.setItem(MORNING_TIME_KEY, time).catch(() => {});
  }, []);

  return (
    <NotificationsContext.Provider value={{ notificationsEnabled, setNotificationsEnabled, morningTime, setMorningTime }}>
      {Platform.OS !== 'web' && <NotificationActions morningTime={morningTime} />}
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotificationsSettings() {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error('useNotificationsSettings must be used within a NotificationsProvider');
  return context;
}

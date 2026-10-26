import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import { useAuth } from '@/context/auth-context';
import { useBirthdaysContext } from '@/context/birthdays-context';
import { useEscalationSettings } from '@/context/escalation-context';
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
const OVERDUE_NUDGES_KEY = 'settings:overdueNudges';
const MORNING_DIGEST_KEY = 'settings:morningDigest';
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

type NotificationsContextValue = {
  notificationsEnabled: boolean;
  /** Turning on asks for OS permission; resolves to false if it was denied. */
  setNotificationsEnabled: (enabled: boolean) => Promise<boolean>;
  /** HH:mm at which alerts of tasks without their own time go off. */
  morningTime: string;
  setMorningTime: (time: string) => void;
  /** Whether a daily nudge repeats every morning while tasks stay overdue. */
  overdueNudges: boolean;
  setOverdueNudges: (enabled: boolean) => void;
  /** Whether the morning summary announces tasks that became urgent and tasks due today or tomorrow. */
  morningDigest: boolean;
  setMorningDigest: (enabled: boolean) => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

/**
 * Buttons on a task notification: tick it off, or push it to later. Handled once data is ready, since
 * tapping one from a killed app launches us first. Native only: the hook has no web implementation.
 */
function NotificationActions({
  morningTime,
  overdueNudges,
  morningDigest,
}: {
  morningTime: string;
  overdueNudges: boolean;
  morningDigest: boolean;
}) {
  const { escalationDays } = useEscalationSettings();
  const { user } = useAuth();
  const { t } = useLocale();
  const { tasks, isLoaded: tasksLoaded, toggleTask, rescheduleTask, deleteTask } = useTasksContext();
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
    } else if (action.type === 'postpone') {
      rescheduleTask(task.id, action.dueDate);
    } else if (action.type === 'delete') {
      deleteTask(task.id);
    } else {
      addSnooze(task.id, action.at)
        .then(() => syncReminders(tasks, birthdays, t, morningTime, overdueNudges, { escalationDays, enabled: morningDigest }))
        .catch(() => {});
    }
  }, [response, user, tasksLoaded, tasks, birthdays, t, morningTime, overdueNudges, morningDigest, escalationDays, toggleTask, rescheduleTask, deleteTask]);

  return null;
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { t } = useLocale();
  const { escalationDays } = useEscalationSettings();
  const { tasks, isLoaded: tasksLoaded } = useTasksContext();
  const { birthdays, isLoaded: birthdaysLoaded } = useBirthdaysContext();
  const [notificationsEnabled, setEnabledState] = useState(true);
  const [morningTime, setMorningTimeState] = useState(DEFAULT_REMIND_TIME);
  const [overdueNudges, setOverdueNudgesState] = useState(true);
  const [morningDigest, setMorningDigestState] = useState(true);
  const [prefLoaded, setPrefLoaded] = useState(false);
  // Bumped when the app returns to the foreground so the schedule is rebuilt from the current clock.
  const [resumes, setResumes] = useState(0);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(NOTIFICATIONS_KEY),
      AsyncStorage.getItem(MORNING_TIME_KEY),
      AsyncStorage.getItem(OVERDUE_NUDGES_KEY),
      AsyncStorage.getItem(MORNING_DIGEST_KEY),
    ])
      .then(([enabled, morning, nudges, digest]) => {
        if (enabled !== null) setEnabledState(enabled === 'true');
        if (morning && TIME_PATTERN.test(morning)) setMorningTimeState(morning);
        if (nudges !== null) setOverdueNudgesState(nudges === 'true');
        if (digest !== null) setMorningDigestState(digest === 'true');
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
        if (granted && !cancelled) return syncReminders(tasks, birthdays, t, morningTime, overdueNudges, { escalationDays, enabled: morningDigest });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [prefLoaded, user, notificationsEnabled, tasksLoaded, birthdaysLoaded, tasks, birthdays, t, morningTime, overdueNudges, morningDigest, escalationDays, resumes]);

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

  const setOverdueNudges = useCallback((enabled: boolean) => {
    setOverdueNudgesState(enabled);
    AsyncStorage.setItem(OVERDUE_NUDGES_KEY, String(enabled)).catch(() => {});
  }, []);

  const setMorningDigest = useCallback((enabled: boolean) => {
    setMorningDigestState(enabled);
    AsyncStorage.setItem(MORNING_DIGEST_KEY, String(enabled)).catch(() => {});
  }, []);

  return (
    <NotificationsContext.Provider
      value={{
        notificationsEnabled,
        setNotificationsEnabled,
        morningTime,
        setMorningTime,
        overdueNudges,
        setOverdueNudges,
        morningDigest,
        setMorningDigest,
      }}>
      {Platform.OS !== 'web' && (
        <NotificationActions morningTime={morningTime} overdueNudges={overdueNudges} morningDigest={morningDigest} />
      )}
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotificationsSettings() {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error('useNotificationsSettings must be used within a NotificationsProvider');
  return context;
}

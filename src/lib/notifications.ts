import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Birthday } from '@/types/birthday';
import type { Task } from '@/types/task';

/** iOS keeps at most 64 pending local notifications; stay safely below it. */
const MAX_SCHEDULED = 60;
const DEFAULT_BIRTHDAY_TIME = '09:00';
const CHANNEL_ID = 'default';

type Translate = (key: string, params?: Record<string, string | number>) => string;
type Planned = { date: Date; title: string; body: string };

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** Asks for permission if it has not been decided yet; resolves to whether we may notify. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'TaskHub',
      importance: Notifications.AndroidImportance.MAX,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return asked.granted;
}

export async function cancelAllReminders() {
  if (Platform.OS === 'web') return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}

function taskReminders(tasks: Task[], now: Date, t: Translate): Planned[] {
  const planned: Planned[] = [];
  for (const task of tasks) {
    if (task.done || !task.remindMe || !task.dueDate || !task.remindTime) continue;
    const [year, month, day] = task.dueDate.split('-').map(Number);
    const [hours, minutes] = task.remindTime.split(':').map(Number);
    const date = new Date(year, month - 1, day, hours, minutes);
    if (date <= now) continue;
    planned.push({ date, title: task.title, body: t('notifications.taskBody') });
  }
  return planned;
}

function birthdayReminders(birthdays: Birthday[], now: Date, t: Translate): Planned[] {
  const planned: Planned[] = [];
  for (const birthday of birthdays) {
    // Birthdays saved before the reminder option existed carry no fields and keep the old 09:00 reminder.
    const [, month, day] = birthday.date.split('-').map(Number);
    const [hours, minutes] = (birthday.remindTime ?? DEFAULT_BIRTHDAY_TIME).split(':').map(Number);
    let date = new Date(now.getFullYear(), month - 1, day, hours, minutes);
    if (date <= now) date = new Date(now.getFullYear() + 1, month - 1, day, hours, minutes);
    if (birthday.remindMe !== false) {
      planned.push({ date, title: t('notifications.birthdayTitle'), body: t('notifications.birthdayBody', { name: birthday.name }) });
    }
    if (birthday.alertDaysBefore) {
      // Same time of day, N days earlier; if that moment has passed this year, wait for the next one.
      const alertAt = (year: number) => new Date(year, month - 1, day - birthday.alertDaysBefore!, hours, minutes);
      let alertDate = alertAt(now.getFullYear());
      if (alertDate <= now) alertDate = alertAt(now.getFullYear() + 1);
      planned.push({
        date: alertDate,
        title: t('notifications.birthdayAlertTitle'),
        body: `${birthday.name}: ${t('birthdays.inDays', { n: birthday.alertDaysBefore })}`,
      });
    }
  }
  return planned;
}

/**
 * Replaces every pending local notification with the current tasks' reminders and the next
 * birthday of each person. Rerun whenever the data changes; also on app start, which keeps
 * birthdays rolling over to the following year.
 */
export async function syncReminders(tasks: Task[], birthdays: Birthday[], t: Translate) {
  if (Platform.OS === 'web') return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  const now = new Date();
  const planned = [...taskReminders(tasks, now, t), ...birthdayReminders(birthdays, now, t)]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, MAX_SCHEDULED);
  for (const { date, title, body } of planned) {
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: CHANNEL_ID },
    });
  }
}

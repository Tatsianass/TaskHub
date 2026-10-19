import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Birthday } from '@/types/birthday';
import type { Task } from '@/types/task';
import { DEFAULT_REMIND_TIME, anchorTime, offsetLabel, reminderDate, taskOffsets } from '@/utils/reminders';

/** iOS keeps at most 64 pending local notifications; stay safely below it. */
const MAX_SCHEDULED = 60;
const DEFAULT_BIRTHDAY_TIME = '09:00';
const CHANNEL_ID = 'default';

type Translate = (key: string, params?: Record<string, string | number>) => string;
type Planned = { date: Date; title: string; body: string; taskId?: string };

const TASK_CATEGORY = 'task';
const SNOOZES_KEY = 'reminders:snoozed';

/** Buttons under a task notification; `resolveAction` turns a tapped one into what to do. */
export const ACTION_DONE = 'done';
const ACTION_SNOOZE_15 = 'snooze15';
const ACTION_SNOOZE_60 = 'snooze60';
const ACTION_SNOOZE_TOMORROW = 'snoozeTomorrow';

export type NotificationAction = { type: 'done' } | { type: 'snooze'; at: Date };

/** What a tapped notification button means; null for a plain tap on the notification itself. */
export function resolveAction(actionId: string, now: Date, morningTime: string): NotificationAction | null {
  switch (actionId) {
    case ACTION_DONE:
      return { type: 'done' };
    case ACTION_SNOOZE_15:
      return { type: 'snooze', at: new Date(now.getTime() + 15 * 60_000) };
    case ACTION_SNOOZE_60:
      return { type: 'snooze', at: new Date(now.getTime() + 60 * 60_000) };
    case ACTION_SNOOZE_TOMORROW:
      return { type: 'snooze', at: reminderDate(toDateString(addDays(now, 1)), morningTime, 0) };
    default:
      return null;
  }
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function toDateString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

type Snooze = { taskId: string; at: number };

async function loadSnoozes(): Promise<Snooze[]> {
  try {
    const parsed: unknown = JSON.parse((await AsyncStorage.getItem(SNOOZES_KEY)) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is Snooze => !!item && typeof item.taskId === 'string' && typeof item.at === 'number',
    );
  } catch {
    return [];
  }
}

/** Remembers a snooze so it survives the next full reschedule; a task has at most one. */
export async function addSnooze(taskId: string, at: Date) {
  const others = (await loadSnoozes()).filter((item) => item.taskId !== taskId);
  await AsyncStorage.setItem(SNOOZES_KEY, JSON.stringify([...others, { taskId, at: at.getTime() }]));
}

/** Pending snoozes of tasks that still exist and are open; the rest are dropped from storage. */
async function snoozeReminders(tasks: Task[], now: Date, t: Translate): Promise<Planned[]> {
  const all = await loadSnoozes();
  const planned: Planned[] = [];
  const kept: Snooze[] = [];
  for (const snooze of all) {
    const task = tasks.find((item) => item.id === snooze.taskId);
    if (!task || task.done || snooze.at <= now.getTime()) continue;
    kept.push(snooze);
    planned.push({ date: new Date(snooze.at), title: task.title, body: t('notifications.taskBody'), taskId: task.id });
  }
  if (kept.length !== all.length) await AsyncStorage.setItem(SNOOZES_KEY, JSON.stringify(kept)).catch(() => {});
  return planned;
}

async function registerCategories(t: Translate) {
  const options = { opensAppToForeground: true };
  await Notifications.setNotificationCategoryAsync(TASK_CATEGORY, [
    { identifier: ACTION_DONE, buttonTitle: t('notifications.actionDone'), options },
    { identifier: ACTION_SNOOZE_15, buttonTitle: t('notifications.snooze15'), options },
    { identifier: ACTION_SNOOZE_60, buttonTitle: t('notifications.snooze60'), options },
    { identifier: ACTION_SNOOZE_TOMORROW, buttonTitle: t('notifications.snoozeTomorrow'), options },
  ]);
}

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

export function cancelAllReminders() {
  if (Platform.OS === 'web') return Promise.resolve();
  return inOrder(() => Notifications.cancelAllScheduledNotificationsAsync());
}

function taskReminders(tasks: Task[], now: Date, t: Translate, morningTime: string): Planned[] {
  const planned: Planned[] = [];
  for (const task of tasks) {
    if (task.done || !task.dueDate) continue;
    const time = anchorTime(task, morningTime);
    for (const offset of taskOffsets(task)) {
      const date = reminderDate(task.dueDate, time, offset);
      if (date <= now) continue;
      const what = offset === 0 ? t('notifications.taskBody') : offsetLabel(t, offset);
      // A task with its own time says when it is due; an all-day one only says how early the alert is.
      planned.push({ date, title: task.title, body: task.remindTime ? `${what} · ${task.remindTime}` : what, taskId: task.id });
    }
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

// Two overlapping syncs would each cancel the other's work and then schedule everything twice.
let queue: Promise<unknown> = Promise.resolve();
function inOrder<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => {});
  return run;
}

/**
 * Replaces every pending local notification with the current tasks' reminders, snoozed ones and the
 * next birthday of each person. Rerun whenever the data changes and whenever the app comes back to
 * the foreground, which refills the 64-notification window and rolls birthdays over to next year.
 */
export function syncReminders(tasks: Task[], birthdays: Birthday[], t: Translate, morningTime = DEFAULT_REMIND_TIME) {
  if (Platform.OS === 'web') return Promise.resolve();
  return inOrder(async () => {
    await registerCategories(t).catch(() => {});
    await Notifications.cancelAllScheduledNotificationsAsync();
    const now = new Date();
    const planned = [
      ...taskReminders(tasks, now, t, morningTime),
      ...(await snoozeReminders(tasks, now, t)),
      ...birthdayReminders(birthdays, now, t),
    ]
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(0, MAX_SCHEDULED);
    for (const { date, title, body, taskId } of planned) {
      await Notifications.scheduleNotificationAsync({
        content: taskId ? { title, body, data: { taskId }, categoryIdentifier: TASK_CATEGORY } : { title, body },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: CHANNEL_ID },
      });
    }
  });
}

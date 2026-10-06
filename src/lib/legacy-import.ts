import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native';

import { api } from '@/lib/api';
import type { Birthday } from '@/types/birthday';
import type { QuadrantId, TagId, Task } from '@/types/task';

// Where the app kept everything before data moved to the server (R6).
const TASKS_KEY = 'task-manager:tasks:v3';
const BIRTHDAYS_KEY = 'task-manager:birthdays:v1';
const LEGACY_KEYS = [TASKS_KEY, BIRTHDAYS_KEY, 'auth:users', 'auth:session'];

const QUADRANT_IDS: QuadrantId[] = [
  'urgent-important',
  'not-urgent-important',
  'urgent-not-important',
  'not-urgent-not-important',
];
const TAG_IDS: TagId[] = ['work', 'home'];

export type LegacyData = { tasks: Task[]; birthdays: Birthday[] };

type Raw = Record<string, unknown>;
type Translate = (key: string) => string;

const isObject = (value: unknown): value is Raw => typeof value === 'object' && value !== null;

const nonEmpty = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** `YYYY-MM-DD` that is a real calendar date, else null (same rule as the server). */
function validDate(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day ? value : null;
}

function validTime(value: unknown) {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours < 24 && minutes < 60 ? value : null;
}

/**
 * Tasks saved by older app versions lack fields added later (`tag`,
 * `remindMe`, `remindTime`), and the server rejects the whole import if one
 * item is invalid. Fill later fields with their defaults; drop only items
 * missing something every version had.
 */
function toTask(raw: unknown): Task | null {
  if (!isObject(raw)) return null;
  const id = nonEmpty(raw.id);
  const title = nonEmpty(raw.title);
  const quadrantId = QUADRANT_IDS.find((quadrant) => quadrant === raw.quadrantId);
  const createdAt = typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : null;
  if (!id || !title || !quadrantId || createdAt === null) return null;
  return {
    id,
    title,
    description: typeof raw.description === 'string' ? raw.description.trim() : '',
    quadrantId,
    tag: TAG_IDS.find((tag) => tag === raw.tag) ?? null,
    done: raw.done === true,
    completedAt: null,
    createdAt,
    dueDate: validDate(raw.dueDate),
    remindMe: raw.remindMe === true,
    remindTime: validTime(raw.remindTime),
  };
}

function toBirthday(raw: unknown): Birthday | null {
  if (!isObject(raw)) return null;
  const id = nonEmpty(raw.id);
  const name = nonEmpty(raw.name);
  const date = validDate(raw.date);
  return id && name && date ? { id, name, date, remindMe: true, remindTime: '09:00', alertDaysBefore: null } : null;
}

async function readList<T>(key: string, parse: (raw: unknown) => T | null): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.map(parse).filter((item): item is T => item !== null) : [];
  } catch {
    return [];
  }
}

/** Tasks and birthdays left on this device by the pre-server app, or null if there are none. */
export async function readLegacyData(): Promise<LegacyData | null> {
  const [tasks, birthdays] = await Promise.all([readList(TASKS_KEY, toTask), readList(BIRTHDAYS_KEY, toBirthday)]);
  return tasks.length || birthdays.length ? { tasks, birthdays } : null;
}

/** Removes every legacy key, including the old local accounts (R6.3, R6.4). */
export async function clearLegacyData() {
  await AsyncStorage.multiRemove(LEGACY_KEYS);
}

function confirmImport(t: Translate): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${t('import.prompt.title')}\n\n${t('import.prompt.message')}`));
  }
  return new Promise((resolve) => {
    Alert.alert(t('import.prompt.title'), t('import.prompt.message'), [
      { text: t('import.prompt.no'), style: 'cancel', onPress: () => resolve(false) },
      { text: t('import.prompt.yes'), onPress: () => resolve(true) },
    ]);
  });
}

/**
 * Right after sign-in (with the new session token already set), offers to
 * upload the device's legacy data into the account. Yes → `POST /import`
 * then clear; No → clear. If the upload fails the data is kept, so the offer
 * comes back on the next sign-in. Never throws: sign-in must not fail over it.
 */
export async function offerLegacyImport(t: Translate) {
  try {
    const data = await readLegacyData();
    if (data && (await confirmImport(t))) {
      await api('/import', { method: 'POST', body: data });
    }
    await clearLegacyData();
  } catch {
    // Upload failed or storage unavailable: keep the legacy keys for next time.
  }
}

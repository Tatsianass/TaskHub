import { File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';

import { api } from '@/lib/api';
import { nonEmpty, validDate, validTime } from '@/lib/legacy-import';
import type { Birthday } from '@/types/birthday';
import type { QuadrantId, TagId, Task } from '@/types/task';

const FORMAT = 'taskhub-backup';
const VERSION = 1;

const QUADRANT_IDS: QuadrantId[] = [
  'urgent-important',
  'not-urgent-important',
  'urgent-not-important',
  'not-urgent-not-important',
];
const TAG_IDS: TagId[] = ['work', 'home'];

export type BackupData = { tasks: Task[]; birthdays: Birthday[] };
export type ImportResult = { added: number; skipped: number; failed: number };

/** Thrown for a file that isn't a TaskHub backup; the message is a translation key. */
export class BackupError extends Error {}

type Raw = Record<string, unknown>;
const isObject = (value: unknown): value is Raw => typeof value === 'object' && value !== null;
const finiteNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

function parseTask(raw: unknown): Task | null {
  if (!isObject(raw)) return null;
  const id = nonEmpty(raw.id);
  const title = nonEmpty(raw.title);
  const quadrantId = QUADRANT_IDS.find((quadrant) => quadrant === raw.quadrantId);
  const createdAt = finiteNumber(raw.createdAt);
  if (!id || !title || !quadrantId || createdAt === null) return null;
  const done = raw.done === true;
  return {
    id,
    title,
    description: typeof raw.description === 'string' ? raw.description.trim() : '',
    quadrantId,
    tag: TAG_IDS.find((tag) => tag === raw.tag) ?? null,
    done,
    completedAt: done ? finiteNumber(raw.completedAt) : null,
    createdAt,
    dueDate: validDate(raw.dueDate),
    remindMe: raw.remindMe === true,
    remindTime: validTime(raw.remindTime),
  };
}

function parseBirthday(raw: unknown): Birthday | null {
  if (!isObject(raw)) return null;
  const id = nonEmpty(raw.id);
  const name = nonEmpty(raw.name);
  const date = validDate(raw.date);
  if (!id || !name || !date) return null;
  const alert = finiteNumber(raw.alertDaysBefore);
  return {
    id,
    name,
    date,
    remindMe: raw.remindMe === true,
    remindTime: validTime(raw.remindTime),
    alertDaysBefore: alert !== null && alert >= 0 ? Math.floor(alert) : null,
  };
}

/** Reads a backup file's text; items that are malformed are dropped, a foreign file is rejected. */
export function parseBackup(text: string): BackupData {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new BackupError('backup.invalidFile');
  }
  if (!isObject(json) || json.format !== FORMAT) throw new BackupError('backup.invalidFile');
  if (typeof json.version === 'number' && json.version > VERSION) throw new BackupError('backup.newerVersion');
  const list = (value: unknown) => (Array.isArray(value) ? value : []);
  return {
    tasks: list(json.tasks).map(parseTask).filter((item): item is Task => item !== null),
    birthdays: list(json.birthdays).map(parseBirthday).filter((item): item is Birthday => item !== null),
  };
}

/** Writes all tasks and birthdays to a JSON file and opens the share sheet (Save to Files, AirDrop, ...). */
export async function exportBackup(data: BackupData, dialogTitle: string) {
  const stamp = new Date().toISOString().slice(0, 10);
  const file = new File(Paths.cache, `taskhub-backup-${stamp}.json`);
  file.create({ overwrite: true });
  file.write(JSON.stringify({ format: FORMAT, version: VERSION, exportedAt: Date.now(), ...data }, null, 2));
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle });
}

/** Lets the user pick a backup file; null if they cancel. */
export async function pickBackup(): Promise<BackupData | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'public.json', 'text/plain'],
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  return parseBackup(await new File(result.assets[0].uri).text());
}

/**
 * Adds what the device doesn't have yet. Items whose id already exists are left alone,
 * so importing the same file twice never duplicates or overwrites anything.
 */
export async function importBackup(
  data: BackupData,
  existing: { taskIds: Set<string>; birthdayIds: Set<string> },
): Promise<ImportResult> {
  const result: ImportResult = { added: 0, skipped: 0, failed: 0 };
  const upload = async (path: string, item: { id: string }, known: Set<string>) => {
    if (known.has(item.id)) {
      result.skipped++;
      return;
    }
    try {
      await api(path, { method: 'POST', body: item });
      result.added++;
    } catch {
      result.failed++;
    }
  };
  for (const task of data.tasks) await upload('/tasks', task, existing.taskIds);
  for (const birthday of data.birthdays) await upload('/birthdays', birthday, existing.birthdayIds);
  return result;
}

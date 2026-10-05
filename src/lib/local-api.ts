import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiError } from '@/lib/api-error';
import type { Birthday } from '@/types/birthday';
import type { Task } from '@/types/task';

// Device-only stand-in for the server: answers the same requests api() would
// send, but reads and writes AsyncStorage. Separate keys from the pre-server
// legacy ones, which legacy-import.ts clears.
const TASKS_KEY = 'taskhub:local:tasks';
const BIRTHDAYS_KEY = 'taskhub:local:birthdays';

type Options = { method?: string; body?: unknown };
type Item = { id: string };

async function read<T>(key: string): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? (list as T[]) : [];
  } catch {
    return [];
  }
}

async function write(key: string, items: unknown[]) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(items));
  } catch {
    throw new ApiError('UNKNOWN', 500);
  }
}

// Writes are read-modify-write; run them one at a time so quick successive
// edits (e.g. "clear completed") don't overwrite each other.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>): Promise<T> {
  const result = queue.then(job, job);
  queue = result.catch(() => {});
  return result;
}

function isItem(body: unknown): body is Item {
  return typeof body === 'object' && body !== null && typeof (body as Item).id === 'string';
}

async function collection<T extends Item>(key: string, id: string | null, opts: Options, newestFirst: boolean) {
  const method = opts.method ?? 'GET';
  if (id === null && method === 'GET') return read<T>(key);

  return serial(async () => {
    const items = await read<T>(key);
    if (id === null && method === 'POST') {
      if (!isItem(opts.body)) throw new ApiError('INVALID_TASK', 400);
      const created = opts.body as T;
      if (items.some((item) => item.id === created.id)) throw new ApiError('DUPLICATE_ID', 409);
      await write(key, newestFirst ? [created, ...items] : [...items, created]);
      return created;
    }
    if (id !== null && method === 'PUT') {
      if (!isItem(opts.body)) throw new ApiError('INVALID_TASK', 400);
      if (!items.some((item) => item.id === id)) throw new ApiError('NOT_FOUND', 404);
      await write(key, items.map((item) => (item.id === id ? { ...(opts.body as T), id } : item)));
      return opts.body;
    }
    if (id !== null && method === 'DELETE') {
      if (!items.some((item) => item.id === id)) throw new ApiError('NOT_FOUND', 404);
      await write(key, items.filter((item) => item.id !== id));
      return undefined;
    }
    throw new ApiError('NOT_FOUND', 404);
  });
}

export async function localApi<T>(path: string, opts: Options = {}): Promise<T> {
  const [, resource, rawId] = path.split('?')[0].split('/');
  const id = rawId ? decodeURIComponent(rawId) : null;
  if (resource === 'tasks') return (await collection<Task>(TASKS_KEY, id, opts, true)) as T;
  if (resource === 'birthdays') return (await collection<Birthday>(BIRTHDAYS_KEY, id, opts, false)) as T;
  throw new ApiError('NOT_FOUND', 404);
}

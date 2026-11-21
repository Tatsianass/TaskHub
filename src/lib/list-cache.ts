import AsyncStorage from '@react-native-async-storage/async-storage';

// Server mode only: a copy of each user's lists (tasks, birthdays) on the device, so the app can
// show them at once on launch (and offline) while the fresh copy loads from the server
// (stale-while-revalidate). The server stays the source of truth; every successful fetch overwrites
// the copy. Local mode doesn't use this: there AsyncStorage already is the database.
const PREFIX = 'cache:list:v1:';

/** Cached entries older than this aren't shown: a week-old list is more confusing than a spinner. */
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type Entry<T> = { savedAt: number; items: T[] };

const keyFor = (userId: string, path: string) => `${PREFIX}${userId}:${path}`;

export async function readListCache<T>(userId: string, path: string, now = Date.now()): Promise<T[] | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId, path));
    if (!raw) return null;
    const entry = JSON.parse(raw) as Partial<Entry<T>>;
    if (!Array.isArray(entry.items) || typeof entry.savedAt !== 'number') return null;
    if (now - entry.savedAt > MAX_AGE_MS) return null;
    return entry.items;
  } catch {
    return null;
  }
}

export async function writeListCache<T>(userId: string, path: string, items: T[], now = Date.now()) {
  try {
    await AsyncStorage.setItem(keyFor(userId, path), JSON.stringify({ savedAt: now, items } satisfies Entry<T>));
  } catch {
    // The cache is an optimisation; a full disk just means a cold start next time.
  }
}

/** Forgets every cached list (all users). Called on sign-out and account deletion. */
export async function clearListCache() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter((key) => key.startsWith(PREFIX));
    if (mine.length > 0) await AsyncStorage.multiRemove(mine);
  } catch {
    // Nothing more we can do; the entries expire after MAX_AGE_MS anyway.
  }
}

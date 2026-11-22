import AsyncStorage from '@react-native-async-storage/async-storage';

import { api } from '@/lib/api';
import { createWriteQueue, type Write } from '@/lib/write-queue-core';

// Server mode only. One list per user, so a change made offline can't end up in another account.
const PREFIX = 'queue:writes:v1:';

export const writeQueue = createWriteQueue({
  async load(userId) {
    const parsed: unknown = JSON.parse((await AsyncStorage.getItem(PREFIX + userId)) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is Write =>
        !!item && typeof item.id === 'string' && typeof item.path === 'string' && typeof item.method === 'string',
    );
  },
  async save(userId, writes) {
    if (writes.length === 0) await AsyncStorage.removeItem(PREFIX + userId);
    else await AsyncStorage.setItem(PREFIX + userId, JSON.stringify(writes));
  },
  send: (write) => api(write.path, { method: write.method, body: write.body }),
});

/** Drops every waiting write (all users). Called on sign-out and account deletion: they belong to a session that is gone. */
export async function clearWriteQueues() {
  writeQueue.reset();
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(PREFIX));
    if (keys.length > 0) await AsyncStorage.multiRemove(keys);
  } catch {
    // Nothing more to do; a stale queue is only ever sent with the matching user's own session.
  }
}

import assert from 'node:assert/strict';
import { before, beforeEach, describe, mock, test } from 'node:test';

const store = new Map<string, string>();
mock.module('@react-native-async-storage/async-storage', {
  exports: {
    default: {
      getItem: async (key: string) => store.get(key) ?? null,
      setItem: async (key: string, value: string) => void store.set(key, value),
      getAllKeys: async () => [...store.keys()],
      multiRemove: async (keys: string[]) => keys.forEach((key) => store.delete(key)),
    },
  },
});

let cache: typeof import('@/lib/list-cache');
before(async () => {
  cache = await import('@/lib/list-cache');
});
beforeEach(() => store.clear());

describe('list cache', () => {
  test('round-trips a list per user and path', async () => {
    await cache.writeListCache('u1', '/tasks', [{ id: 'a' }]);
    assert.deepEqual(await cache.readListCache('u1', '/tasks'), [{ id: 'a' }]);
    assert.equal(await cache.readListCache('u2', '/tasks'), null);
    assert.equal(await cache.readListCache('u1', '/birthdays'), null);
  });

  test('entries older than MAX_AGE_MS are ignored', async () => {
    await cache.writeListCache('u1', '/tasks', [{ id: 'a' }], 1_000);
    assert.equal(await cache.readListCache('u1', '/tasks', 1_000 + cache.MAX_AGE_MS + 1), null);
    assert.notEqual(await cache.readListCache('u1', '/tasks', 1_000 + cache.MAX_AGE_MS), null);
  });

  test('corrupt data reads as a miss', async () => {
    store.set('cache:list:v1:u1:/tasks', '{nope');
    assert.equal(await cache.readListCache('u1', '/tasks'), null);
    store.set('cache:list:v1:u1:/tasks', JSON.stringify({ items: 'x', savedAt: 1 }));
    assert.equal(await cache.readListCache('u1', '/tasks'), null);
  });

  test('clearListCache removes only cache entries', async () => {
    await cache.writeListCache('u1', '/tasks', []);
    await cache.writeListCache('u2', '/birthdays', []);
    store.set('settings:locale', 'ru');
    await cache.clearListCache();
    assert.deepEqual([...store.keys()], ['settings:locale']);
  });
});

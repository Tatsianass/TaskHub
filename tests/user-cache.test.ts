import assert from 'node:assert/strict';
import { before, beforeEach, describe, mock, test } from 'node:test';

const store = new Map<string, string>();
mock.module('@react-native-async-storage/async-storage', {
  exports: {
    default: {
      getItem: async (key: string) => store.get(key) ?? null,
      setItem: async (key: string, value: string) => void store.set(key, value),
      removeItem: async (key: string) => void store.delete(key),
    },
  },
});

let cache: typeof import('@/lib/user-cache');
before(async () => {
  cache = await import('@/lib/user-cache');
});
beforeEach(() => store.clear());

describe('user cache', () => {
  test('round-trips and clears', async () => {
    assert.equal(await cache.readCachedUser(), null);
    await cache.writeCachedUser({ id: 'u1', email: 'a@b.co' });
    assert.deepEqual(await cache.readCachedUser(), { id: 'u1', email: 'a@b.co' });
    await cache.clearCachedUser();
    assert.equal(await cache.readCachedUser(), null);
  });

  test('corrupt or malformed entries read as no user', async () => {
    store.set('cache:user:v1', '{oops');
    assert.equal(await cache.readCachedUser(), null);
    store.set('cache:user:v1', JSON.stringify({ id: 1 }));
    assert.equal(await cache.readCachedUser(), null);
  });
});

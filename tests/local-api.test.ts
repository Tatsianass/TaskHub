import assert from 'node:assert/strict';
import { before, beforeEach, describe, mock, test } from 'node:test';

const store = new Map<string, string>();
let failWrites = false;
mock.module('@react-native-async-storage/async-storage', {
  exports: {
    default: {
      getItem: async (key: string) => store.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        if (failWrites) throw new Error('disk full');
        store.set(key, value);
      },
      removeItem: async (key: string) => void store.delete(key),
      multiRemove: async (keys: string[]) => keys.forEach((key) => store.delete(key)),
    },
  },
});

let localApi: typeof import('@/lib/local-api').localApi;
let ApiError: typeof import('@/lib/api-error').ApiError;
before(async () => {
  ({ localApi } = await import('@/lib/local-api'));
  ({ ApiError } = await import('@/lib/api-error'));
});

const task = (id: string, extra = {}) => ({ id, title: id, ...extra });
const call = (path: string, method?: string, body?: unknown) => localApi<any>(path, { method, body });
const rejects = (promise: Promise<unknown>, code: string, status: number) =>
  assert.rejects(promise, (error: unknown) => error instanceof ApiError && error.code === code && error.status === status);

beforeEach(() => {
  store.clear();
  failWrites = false;
});

describe('local API (offline mode) behaves like the server: state transitions', () => {
  test('empty list', async () => assert.deepEqual(await call('/tasks'), []));

  test('POST then GET: tasks are newest first, birthdays keep insertion order', async () => {
    await call('/tasks', 'POST', task('a'));
    await call('/tasks', 'POST', task('b'));
    assert.deepEqual((await call('/tasks')).map((t: any) => t.id), ['b', 'a']);
    await call('/birthdays', 'POST', task('x'));
    await call('/birthdays', 'POST', task('y'));
    assert.deepEqual((await call('/birthdays')).map((t: any) => t.id), ['x', 'y']);
  });

  test('tasks and birthdays are separate collections', async () => {
    await call('/tasks', 'POST', task('a'));
    assert.deepEqual(await call('/birthdays'), []);
  });

  test('duplicate id -> 409 DUPLICATE_ID and nothing changes', async () => {
    await call('/tasks', 'POST', task('a'));
    await rejects(call('/tasks', 'POST', task('a', { title: 'other' })), 'DUPLICATE_ID', 409);
    assert.equal((await call('/tasks')).length, 1);
    assert.equal((await call('/tasks'))[0].title, 'a');
  });

  test('PUT replaces the item and the path id wins over the body id', async () => {
    await call('/tasks', 'POST', task('a'));
    const result = await call('/tasks/a', 'PUT', task('hacked', { title: 'new' }));
    assert.equal(result.title, 'new');
    const list = await call('/tasks');
    assert.deepEqual(list.map((t: any) => [t.id, t.title]), [['a', 'new']]);
  });

  test('PUT / DELETE of a missing id -> 404 NOT_FOUND', async () => {
    await rejects(call('/tasks/nope', 'PUT', task('nope')), 'NOT_FOUND', 404);
    await rejects(call('/tasks/nope', 'DELETE'), 'NOT_FOUND', 404);
  });

  test('lifecycle POST -> PUT -> DELETE -> PUT(404) -> POST same id again (allowed)', async () => {
    await call('/tasks', 'POST', task('a'));
    await call('/tasks/a', 'PUT', task('a', { done: true }));
    await call('/tasks/a', 'DELETE');
    await rejects(call('/tasks/a', 'PUT', task('a')), 'NOT_FOUND', 404);
    await call('/tasks', 'POST', task('a'));
    assert.equal((await call('/tasks')).length, 1);
  });

  test('bodies without a string id -> 400 INVALID_TASK', async () => {
    for (const body of [undefined, null, {}, { id: 1 }, 'x', []]) {
      await rejects(call('/tasks', 'POST', body), 'INVALID_TASK', 400);
    }
    await rejects(call('/tasks/a', 'PUT', {}), 'INVALID_TASK', 400);
  });

  test('ids needing URL-encoding round-trip', async () => {
    const id = 'a/b c?d#e';
    await call('/tasks', 'POST', task(id));
    await call(`/tasks/${encodeURIComponent(id)}`, 'PUT', task(id, { title: 'ok' }));
    assert.equal((await call('/tasks'))[0].title, 'ok');
    await call(`/tasks/${encodeURIComponent(id)}`, 'DELETE');
    assert.deepEqual(await call('/tasks'), []);
  });

  test('query strings and trailing noise are ignored; unknown resources / methods -> 404', async () => {
    await call('/tasks', 'POST', task('a'));
    assert.equal((await call('/tasks?x=1')).length, 1);
    await rejects(call('/nothing'), 'NOT_FOUND', 404);
    await rejects(call('/tasks', 'PATCH', task('a')), 'NOT_FOUND', 404);
    await rejects(call('/tasks/a', 'POST', task('a')), 'NOT_FOUND', 404);
  });
});

describe('local API: storage faults and concurrency', () => {
  test('corrupt JSON and non-array values read as an empty list (and are then overwritten safely)', async () => {
    store.set('taskhub:local:tasks', '{not json');
    assert.deepEqual(await call('/tasks'), []);
    store.set('taskhub:local:tasks', '{"a":1}');
    assert.deepEqual(await call('/tasks'), []);
    await call('/tasks', 'POST', task('a'));
    assert.equal((await call('/tasks')).length, 1);
  });

  test('a failing write -> 500 UNKNOWN and the stored data is untouched', async () => {
    await call('/tasks', 'POST', task('a'));
    failWrites = true;
    await rejects(call('/tasks', 'POST', task('b')), 'UNKNOWN', 500);
    failWrites = false;
    assert.deepEqual((await call('/tasks')).map((t: any) => t.id), ['a']);
  });

  test('a failed write does not wedge the queue', async () => {
    failWrites = true;
    await rejects(call('/tasks', 'POST', task('a')), 'UNKNOWN', 500);
    failWrites = false;
    await call('/tasks', 'POST', task('b'));
    assert.equal((await call('/tasks')).length, 1);
  });

  test('50 parallel POSTs are all stored (serialized read-modify-write)', async () => {
    await Promise.all(Array.from({ length: 50 }, (_, i) => call('/tasks', 'POST', task(`p${i}`))));
    assert.equal((await call('/tasks')).length, 50);
  });

  test('parallel PUT + DELETE of the same task resolve consistently (one wins, no crash, no resurrection)', async () => {
    await call('/tasks', 'POST', task('a'));
    const results = await Promise.allSettled([call('/tasks/a', 'PUT', task('a', { title: 'x' })), call('/tasks/a', 'DELETE')]);
    assert.equal(results[1].status, 'fulfilled');
    assert.deepEqual(await call('/tasks'), []);
  });

  test('"clear completed" style burst of deletes loses nothing it should keep', async () => {
    for (let i = 0; i < 10; i++) await call('/tasks', 'POST', task(`t${i}`));
    await Promise.all([0, 2, 4, 6, 8].map((i) => call(`/tasks/t${i}`, 'DELETE')));
    assert.deepEqual((await call('/tasks')).map((t: any) => t.id).sort(), ['t1', 't3', 't5', 't7', 't9']);
  });
});

describe('local API vs server parity gaps (validation)', () => {
  test('server rejects a task with no title; offline mode stores any object that has an id', async () => {
    // Documented gap: the UI validates titles, the offline store does not. Not a UI-reachable bug,
    // but data imported/edited by other code paths is not checked.
    const created = await call('/tasks', 'POST', { id: 'bare' });
    assert.equal(created.id, 'bare');
  });
});

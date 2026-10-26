import assert from 'node:assert/strict';
import { before, beforeEach, describe, mock, test } from 'node:test';

const store = new Map<string, string>();
const apiCalls: { path: string; body: any }[] = [];
let apiFails = false;
let confirmAnswer = true;
let alerts = 0;

mock.module('react-native', {
  exports: {
    Platform: { OS: 'ios' },
    Alert: {
      alert(_title: string, _msg: string, buttons: { onPress?: () => void; style?: string }[]) {
        alerts += 1;
        buttons.find((b) => (b.style === 'cancel') === !confirmAnswer)?.onPress?.();
      },
    },
  },
});
mock.module('@react-native-async-storage/async-storage', {
  exports: {
    default: {
      getItem: async (key: string) => store.get(key) ?? null,
      setItem: async (key: string, value: string) => void store.set(key, value),
      multiRemove: async (keys: string[]) => keys.forEach((key) => store.delete(key)),
    },
  },
});
mock.module('@/lib/api', {
  exports: {
    api: async (path: string, opts: { body: unknown }) => {
      if (apiFails) throw new Error('offline');
      apiCalls.push({ path, body: opts.body });
    },
  },
});

let m: typeof import('@/lib/legacy-import');
before(async () => {
  m = await import('@/lib/legacy-import');
});
beforeEach(() => {
  store.clear();
  apiCalls.length = 0;
  apiFails = false;
  confirmAnswer = true;
  alerts = 0;
});

const TASKS = 'task-manager:tasks:v3';
const BIRTHDAYS = 'task-manager:birthdays:v1';
const goodTask = { id: 'a', title: 'Buy milk', quadrantId: 'urgent-important', createdAt: 1 };

describe('validDate / validTime: boundaries', () => {
  const dates: [unknown, string | null][] = [
    ['2026-02-28', '2026-02-28'], ['2026-02-29', null], ['2028-02-29', '2028-02-29'], ['2100-02-29', null], ['2000-02-29', '2000-02-29'],
    ['2026-04-30', '2026-04-30'], ['2026-04-31', null], ['2026-12-31', '2026-12-31'], ['2026-13-01', null], ['2026-00-10', null],
    ['2026-01-00', null], ['2026-1-1', null], ['26-01-01', null], ['2026-01-01T00:00', null], [20260101, null], [null, null], [undefined, null], ['', null],
  ];
  for (const [input, expected] of dates) test(`date ${JSON.stringify(input)}`, () => assert.equal(m.validDate(input), expected));
  const times: [unknown, string | null][] = [
    ['00:00', '00:00'], ['23:59', '23:59'], ['24:00', null], ['12:60', null], ['9:00', null], ['09:5', null], ['09:00:00', null], [900, null], [null, null], ['', null], ['ab:cd', null],
  ];
  for (const [input, expected] of times) test(`time ${JSON.stringify(input)}`, () => assert.equal(m.validTime(input), expected));
  test('nonEmpty trims and rejects blank / non-strings', () => {
    assert.equal(m.nonEmpty('  x '), 'x');
    for (const v of ['', '   ', null, 5, {}, undefined]) assert.equal(m.nonEmpty(v), null);
  });
});

describe('readLegacyData: tolerant reader of data from older app versions', () => {
  test('no data -> null', async () => assert.equal(await m.readLegacyData(), null));
  test('corrupt JSON / non-array -> null', async () => {
    store.set(TASKS, '{broken');
    store.set(BIRTHDAYS, '"str"');
    assert.equal(await m.readLegacyData(), null);
  });
  test('v1-era task missing later fields gets defaults', async () => {
    store.set(TASKS, JSON.stringify([goodTask]));
    const data = await m.readLegacyData();
    assert.deepEqual(data!.tasks[0], {
      id: 'a', title: 'Buy milk', description: '', quadrantId: 'urgent-important', tag: null, done: false, completedAt: null,
      createdAt: 1, dueDate: null, remindMe: false, remindTime: null, remindOffsets: [],
    });
  });
  test('invalid items are dropped one by one, valid neighbours survive', async () => {
    store.set(TASKS, JSON.stringify([
      goodTask,
      null, 'x', 5, [],
      { ...goodTask, id: '' },
      { ...goodTask, id: 'b', title: '  ' },
      { ...goodTask, id: 'c', quadrantId: 'nope' },
      { ...goodTask, id: 'd', createdAt: 'x' },
      { ...goodTask, id: 'e', createdAt: Infinity },
      { ...goodTask, id: 'ok2', dueDate: '2026-02-30', remindTime: '25:00', tag: 'weird', remindMe: true },
    ]));
    const tasks = (await m.readLegacyData())!.tasks;
    assert.deepEqual(tasks.map((t) => t.id), ['a', 'ok2']);
    assert.deepEqual([tasks[1].dueDate, tasks[1].remindTime, tasks[1].tag, tasks[1].remindOffsets], [null, null, null, [0]]);
  });
  test('birthdays: only id + name + real date survive and get the default reminder', async () => {
    store.set(BIRTHDAYS, JSON.stringify([{ id: 'b1', name: 'Ann', date: '1990-02-28' }, { id: 'b2', name: 'Bad', date: '1990-02-30' }, { id: '', name: 'x', date: '1990-01-01' }]));
    const data = await m.readLegacyData();
    assert.deepEqual(data!.birthdays, [{ id: 'b1', name: 'Ann', date: '1990-02-28', remindMe: true, remindTime: '09:00', alertDaysBefore: null }]);
  });
  test('only birthdays present is enough', async () => {
    store.set(BIRTHDAYS, JSON.stringify([{ id: 'b1', name: 'Ann', date: '1990-02-28' }]));
    assert.equal((await m.readLegacyData())!.tasks.length, 0);
  });
});

describe('offerLegacyImport: decision table', () => {
  const t = (key: string) => key;
  const seed = () => {
    store.set(TASKS, JSON.stringify([goodTask]));
    store.set('auth:users', '[]');
    store.set('auth:session', 'x');
  };

  test('data + user says yes + upload ok -> uploaded once, every legacy key removed', async () => {
    seed();
    await m.offerLegacyImport(t);
    assert.equal(apiCalls.length, 1);
    assert.equal(apiCalls[0].path, '/import');
    assert.equal(apiCalls[0].body.tasks.length, 1);
    assert.equal(store.size, 0);
  });
  test('data + user says no -> nothing uploaded, keys removed (the offer is not repeated)', async () => {
    seed();
    confirmAnswer = false;
    await m.offerLegacyImport(t);
    assert.equal(apiCalls.length, 0);
    assert.equal(store.size, 0);
  });
  test('data + yes + upload FAILS -> keys kept so the offer returns next sign-in; never throws', async () => {
    seed();
    apiFails = true;
    await assert.doesNotReject(m.offerLegacyImport(t));
    assert.ok(store.has(TASKS));
    assert.ok(store.has('auth:users'));
  });
  test('no data -> no prompt, stale auth keys still cleaned', async () => {
    store.set('auth:users', '[]');
    await m.offerLegacyImport(t);
    assert.equal(alerts, 0);
    assert.equal(store.size, 0);
  });
  test('running it twice does not upload twice', async () => {
    seed();
    await m.offerLegacyImport(t);
    await m.offerLegacyImport(t);
    assert.equal(apiCalls.length, 1);
  });
});

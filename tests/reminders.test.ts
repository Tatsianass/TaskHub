import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  ALL_DAY_PRESETS,
  MAX_OFFSET_MINUTES,
  MAX_REMINDERS,
  TIMED_PRESETS,
  alertOutlook,
  anchorTime,
  offsetLabel,
  reminderDate,
  sanitizeOffsets,
  taskOffsets,
} from '@/utils/reminders';

import { tr } from './helpers';

describe('sanitizeOffsets: equivalence classes and boundaries', () => {
  const cases: [string, unknown, number[] | undefined][] = [
    ['empty array', [], []],
    ['single zero (lower boundary)', [0], [0]],
    ['-1 (below lower boundary) is dropped', [-1], []],
    ['MAX (upper boundary) is kept', [MAX_OFFSET_MINUTES], [MAX_OFFSET_MINUTES]],
    ['MAX+1 is dropped', [MAX_OFFSET_MINUTES + 1], []],
    ['non-integers are dropped', [1.5, 0.1, 60], [60]],
    ['NaN / Infinity are dropped', [NaN, Infinity, -Infinity, 5], [5]],
    ['numeric strings are dropped', ['60', 15], [15]],
    ['null / undefined / objects in the list are dropped', [null, undefined, {}, [], 10], [10]],
    ['duplicates collapse, order of first appearance kept', [60, 15, 60, 15, 0], [60, 15, 0]],
    ['exactly MAX_REMINDERS kept', [1, 2, 3, 4, 5], [1, 2, 3, 4, 5]],
    ['more than MAX_REMINDERS truncated to the first ones', [1, 2, 3, 4, 5, 6, 7], [1, 2, 3, 4, 5]],
    ['invalid items do not use up slots', [-1, 1, -2, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5]],
    ['duplicates do not use up slots', [1, 1, 1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5]],
  ];
  for (const [name, input, expected] of cases) {
    test(name, () => assert.deepEqual(sanitizeOffsets(input), expected));
  }

  test('MAX_REMINDERS is 5 (documented cap)', () => assert.equal(MAX_REMINDERS, 5));

  test('non-array input reads as the fallback (data from before alerts existed)', () => {
    for (const value of [undefined, null, 'x', 5, {}, true]) {
      assert.deepEqual(sanitizeOffsets(value), []);
      assert.deepEqual(sanitizeOffsets(value, [0]), [0]);
    }
  });
  test('an empty array is NOT replaced by the fallback', () => assert.deepEqual(sanitizeOffsets([], [0]), []));
});

describe('taskOffsets: decision table for legacy tasks', () => {
  const rows: [string, boolean, unknown, number[]][] = [
    ['remindMe=false, no offsets field', false, undefined, []],
    ['remindMe=true, no offsets field (legacy: alert at the time)', true, undefined, [0]],
    ['remindMe=true, offsets=[] (user removed all) -> none', true, [], []],
    ['remindMe=false, offsets=[60] -> offsets win', false, [60], [60]],
    ['remindMe=true, offsets=[60] -> offsets win', true, [60], [60]],
    ['garbage offsets fall back to remindMe', true, 'oops', [0]],
  ];
  for (const [name, remindMe, remindOffsets, expected] of rows) {
    test(name, () => assert.deepEqual(taskOffsets({ remindMe, remindOffsets } as never), expected));
  }
});

describe('offsetLabel: picks the largest unit that divides evenly', () => {
  const cases: [number, string][] = [
    [0, 'reminders.atTime'],
    [1, 'reminders.before.minute|count=1'],
    [59, 'reminders.before.minute|count=59'],
    [60, 'reminders.before.hour|count=1'],
    [90, 'reminders.before.minute|count=90'],
    [120, 'reminders.before.hour|count=2'],
    [1439, 'reminders.before.minute|count=1439'],
    [1440, 'reminders.before.day|count=1'],
    [2880, 'reminders.before.day|count=2'],
    [10079, 'reminders.before.minute|count=10079'],
    [10080, 'reminders.before.week|count=1'],
    [20160, 'reminders.before.week|count=2'],
    [14400, 'reminders.before.day|count=10'],
    [MAX_OFFSET_MINUTES, 'reminders.before.day|count=30'],
  ];
  for (const [minutes, expected] of cases) test(`${minutes} min`, () => assert.equal(offsetLabel(tr, minutes), expected));
  test('every preset has a label', () => {
    for (const m of [...TIMED_PRESETS, ...ALL_DAY_PRESETS]) assert.ok(offsetLabel(tr, m).length > 0);
  });
});

describe('reminderDate', () => {
  const at = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ` +
    `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

  const cases: [string, string, string, number, string][] = [
    ['offset 0', '2026-10-26', '09:00', 0, '2026-10-26 09:00'],
    ['15 min before', '2026-10-26', '09:00', 15, '2026-10-26 08:45'],
    ['crosses midnight backwards', '2026-10-26', '00:10', 30, '2026-10-25 23:40'],
    ['one day before', '2026-10-26', '09:00', 1440, '2026-10-25 09:00'],
    ['crosses month boundary', '2026-11-01', '09:00', 1440, '2026-10-31 09:00'],
    ['crosses year boundary', '2027-01-01', '09:00', 2880, '2026-12-30 09:00'],
    ['30 days before', '2026-10-26', '09:00', 43200, '2026-09-26 09:00'],
    ['leap day', '2028-03-01', '09:00', 1440, '2028-02-29 09:00'],
    ['23:59 is valid', '2026-10-26', '23:59', 0, '2026-10-26 23:59'],
  ];
  for (const [name, due, time, offset, expected] of cases) {
    test(name, () => assert.equal(at(reminderDate(due, time, offset)), expected));
  }
});

describe('anchorTime', () => {
  test('own time wins; all-day falls back to the default', () => {
    assert.equal(anchorTime({ remindTime: '18:30' }, '09:00'), '18:30');
    assert.equal(anchorTime({ remindTime: null }, '09:00'), '09:00');
  });
});

describe('alertOutlook', () => {
  const now = new Date(2026, 9, 26, 10, 0).getTime();

  test('no offsets -> none (even without a date)', () => {
    assert.deepEqual(alertOutlook(null, '09:00', [], now), { kind: 'none' });
    assert.deepEqual(alertOutlook('2026-10-27', '09:00', [], now), { kind: 'none' });
  });
  test('offsets but no date -> needDate', () => assert.deepEqual(alertOutlook(null, '09:00', [0], now), { kind: 'needDate' }));
  test('all in the past -> passed', () => {
    assert.deepEqual(alertOutlook('2026-10-26', '09:00', [0, 30], now), { kind: 'passed' });
  });
  test('boundary: an alert exactly now is already passed (strictly in the future only)', () => {
    assert.deepEqual(alertOutlook('2026-10-26', '10:00', [0], now), { kind: 'passed' });
  });
  test('boundary: one minute ahead is upcoming', () => {
    const outlook = alertOutlook('2026-10-26', '10:01', [0], now);
    assert.equal(outlook.kind, 'next');
  });
  test('picks the earliest upcoming alert, ignoring those already passed', () => {
    // due 12:00: 0 -> 12:00, 60 -> 11:00, 120 -> 10:00 (== now, passed), 180 -> 09:00 (passed)
    const outlook = alertOutlook('2026-10-26', '12:00', [0, 60, 120, 180], now);
    assert.equal(outlook.kind, 'next');
    if (outlook.kind === 'next') assert.equal(outlook.date.getHours(), 11);
  });
});

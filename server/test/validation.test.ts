import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { ApiError } from '../src/errors.js';
import {
  MAX_ID_LENGTH,
  QUADRANT_IDS,
  TAG_IDS,
  parseBirthday,
  parseTask,
  parseTaskUpdate,
  type Birthday,
  type Task,
} from '../src/validation.js';

const validTask: Task = {
  id: '1718000000000-abc123',
  title: 'Buy milk',
  description: '2 litres',
  quadrantId: 'urgent-important',
  tag: 'home',
  done: false,
  completedAt: null,
  createdAt: 1718000000000,
  dueDate: '2026-09-27',
  remindMe: true,
  remindTime: '09:30',
};

const validBirthday: Birthday = {
  id: '1718000000000-xyz789',
  name: 'Ann',
  date: '1990-02-28',
  remindMe: true,
  remindTime: '09:00',
  alertDaysBefore: null,
};

function assertRejects(fn: () => unknown, code: string) {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 400);
    assert.equal(error.code, code);
    return true;
  });
}

describe('parseTask', () => {
  test('returns a valid task unchanged', () => {
    assert.deepEqual(parseTask(validTask), validTask);
  });

  const valid: [string, Partial<Task>][] = [
    ['null tag', { tag: null }],
    ['null dueDate', { dueDate: null }],
    ['null remindTime', { remindTime: null, remindMe: false }],
    ['empty description', { description: '' }],
    ['leap day', { dueDate: '2028-02-29' }],
    ['midnight', { remindTime: '00:00' }],
    ['last minute of day', { remindTime: '23:59' }],
    ['done task', { done: true }],
    ['id of max length', { id: 'x'.repeat(MAX_ID_LENGTH) }],
    ...QUADRANT_IDS.map((quadrantId): [string, Partial<Task>] => [`quadrant ${quadrantId}`, { quadrantId }]),
    ...TAG_IDS.map((tag): [string, Partial<Task>] => [`tag ${tag}`, { tag }]),
  ];
  for (const [name, patch] of valid) {
    test(`accepts ${name}`, () => {
      const task = { ...validTask, ...patch };
      assert.deepEqual(parseTask(task), task);
    });
  }

  test('trims title and description', () => {
    const parsed = parseTask({ ...validTask, title: '  Buy milk \n', description: ' 2 litres ' });
    assert.equal(parsed.title, 'Buy milk');
    assert.equal(parsed.description, '2 litres');
  });

  test('drops unknown fields', () => {
    const parsed = parseTask({ ...validTask, userId: 'someone-else', extra: 1 });
    assert.deepEqual(parsed, validTask);
  });

  const invalid: [string, unknown][] = [
    ['null body', null],
    ['string body', 'task'],
    ['array body', [validTask]],
    ['missing id', { ...validTask, id: undefined }],
    ['empty id', { ...validTask, id: '' }],
    ['numeric id', { ...validTask, id: 42 }],
    ['id too long', { ...validTask, id: 'x'.repeat(MAX_ID_LENGTH + 1) }],
    ['missing title', { ...validTask, title: undefined }],
    ['empty title', { ...validTask, title: '' }],
    ['whitespace title', { ...validTask, title: '   ' }],
    ['numeric title', { ...validTask, title: 1 }],
    ['missing description', { ...validTask, description: undefined }],
    ['null description', { ...validTask, description: null }],
    ['unknown quadrant', { ...validTask, quadrantId: 'urgent' }],
    ['null quadrant', { ...validTask, quadrantId: null }],
    ['unknown tag', { ...validTask, tag: 'school' }],
    ['missing tag', { ...validTask, tag: undefined }],
    ['done as string', { ...validTask, done: 'false' }],
    ['done as number', { ...validTask, done: 0 }],
    ['missing done', { ...validTask, done: undefined }],
    ['completedAt as string', { ...validTask, completedAt: '1718000000000' }],
    ['completedAt NaN', { ...validTask, completedAt: Number.NaN }],
    ['remindMe as number', { ...validTask, remindMe: 1 }],
    ['createdAt as string', { ...validTask, createdAt: '1718000000000' }],
    ['createdAt NaN', { ...validTask, createdAt: Number.NaN }],
    ['createdAt Infinity', { ...validTask, createdAt: Number.POSITIVE_INFINITY }],
    ['missing createdAt', { ...validTask, createdAt: undefined }],
    ['dueDate not a date', { ...validTask, dueDate: 'tomorrow' }],
    ['dueDate with time', { ...validTask, dueDate: '2026-09-27T10:00:00Z' }],
    ['dueDate short year', { ...validTask, dueDate: '26-09-27' }],
    ['dueDate Feb 30', { ...validTask, dueDate: '2026-02-30' }],
    ['dueDate Feb 29 non-leap', { ...validTask, dueDate: '2026-02-29' }],
    ['dueDate month 13', { ...validTask, dueDate: '2026-13-01' }],
    ['dueDate day 00', { ...validTask, dueDate: '2026-09-00' }],
    ['dueDate as number', { ...validTask, dueDate: 20260927 }],
    ['missing dueDate', { ...validTask, dueDate: undefined }],
    ['remindTime without zero pad', { ...validTask, remindTime: '9:30' }],
    ['remindTime with seconds', { ...validTask, remindTime: '09:30:00' }],
    ['remindTime hour 24', { ...validTask, remindTime: '24:00' }],
    ['remindTime minute 60', { ...validTask, remindTime: '09:60' }],
    ['remindTime 12h format', { ...validTask, remindTime: '09:30 PM' }],
    ['missing remindTime', { ...validTask, remindTime: undefined }],
  ];
  for (const [name, body] of invalid) {
    test(`rejects ${name} with 400 INVALID_TASK`, () => {
      assertRejects(() => parseTask(body), 'INVALID_TASK');
    });
  }
});

describe('completedAt', () => {
  test('is kept when set', () => {
    assert.equal(parseTask({ ...validTask, done: true, completedAt: 1718000500000 }).completedAt, 1718000500000);
  });

  test('reads as null when an older client omits it', () => {
    assert.equal(parseTask({ ...validTask, completedAt: undefined }).completedAt, null);
    assert.equal(parseTaskUpdate({ ...validTask, completedAt: undefined }).completedAt, null);
  });
});

describe('parseTaskUpdate', () => {
  test('ignores id and createdAt', () => {
    const update: Partial<Task> = { ...validTask };
    delete update.id;
    delete update.createdAt;
    assert.deepEqual(parseTaskUpdate(validTask), update);
    assert.deepEqual(parseTaskUpdate(update), update);
    assert.deepEqual(parseTaskUpdate({ ...update, id: 42, createdAt: 'x' }), update);
  });

  test('rejects an invalid field with 400 INVALID_TASK', () => {
    assertRejects(() => parseTaskUpdate({ ...validTask, title: ' ' }), 'INVALID_TASK');
    assertRejects(() => parseTaskUpdate({ ...validTask, done: undefined }), 'INVALID_TASK');
  });
});

describe('parseBirthday', () => {
  test('returns a valid birthday unchanged', () => {
    assert.deepEqual(parseBirthday(validBirthday), validBirthday);
  });

  test('a missing reminder pair defaults to 09:00 (older clients)', () => {
    const { remindMe, remindTime, alertDaysBefore, ...legacy } = validBirthday;
    assert.deepEqual(parseBirthday(legacy), validBirthday);
  });

  test('trims name and drops unknown fields', () => {
    const parsed = parseBirthday({ ...validBirthday, name: '  Ann ', userId: 'x' });
    assert.deepEqual(parsed, validBirthday);
  });

  const invalid: [string, unknown][] = [
    ['null body', null],
    ['array body', [validBirthday]],
    ['missing id', { ...validBirthday, id: undefined }],
    ['empty id', { ...validBirthday, id: '' }],
    ['missing name', { ...validBirthday, name: undefined }],
    ['whitespace name', { ...validBirthday, name: ' \t ' }],
    ['numeric name', { ...validBirthday, name: 7 }],
    ['missing date', { ...validBirthday, date: undefined }],
    ['null date', { ...validBirthday, date: null }],
    ['date not a date', { ...validBirthday, date: '28/02/1990' }],
    ['date Feb 29 non-leap', { ...validBirthday, date: '1990-02-29' }],
  ];
  for (const [name, body] of invalid) {
    test(`rejects ${name} with 400 INVALID_BIRTHDAY`, () => {
      assertRejects(() => parseBirthday(body), 'INVALID_BIRTHDAY');
    });
  }
});

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { ApiError } from '../src/errors.js';
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_ID_LENGTH,
  MAX_NAME_LENGTH,
  MAX_TITLE_LENGTH,
  QUADRANT_IDS,
  TAG_IDS,
  parseBirthday,
  parseTask,
  parseTaskPatch,
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
  remindOffsets: [0, 60],
  repeat: 'monthly',
  seriesId: 's-1718000000000-abc123',
  repeatAnchor: '2026-09-27',
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

  test('a client that sends no remindOffsets keeps the old behaviour', () => {
    const { remindOffsets, ...legacy } = validTask;
    assert.deepEqual(parseTask(legacy).remindOffsets, [0]);
    assert.deepEqual(parseTask({ ...legacy, remindMe: false, remindTime: null }).remindOffsets, []);
  });

  test('a client that sends no repeat gets a task that does not repeat', () => {
    const { repeat, ...legacy } = validTask;
    assert.equal(parseTask(legacy).repeat, null);
    assert.equal(parseTask({ ...legacy, repeat: null }).repeat, null);
  });

  test('boundary lengths are accepted', () => {
    assert.equal(parseTask({ ...validTask, title: 'a'.repeat(MAX_TITLE_LENGTH) }).title.length, MAX_TITLE_LENGTH);
    assert.equal(parseTask({ ...validTask, description: 'a'.repeat(MAX_DESCRIPTION_LENGTH) }).description.length, MAX_DESCRIPTION_LENGTH);
    assert.equal(parseTask({ ...validTask, createdAt: 0 }).createdAt, 0);
    assert.equal(parseTask({ ...validTask, createdAt: Number.MAX_SAFE_INTEGER }).createdAt, Number.MAX_SAFE_INTEGER);
  });

  test('the title limit counts the trimmed title', () => {
    assert.equal(parseTask({ ...validTask, title: `  ${'a'.repeat(MAX_TITLE_LENGTH)}  ` }).title.length, MAX_TITLE_LENGTH);
  });

  test('a client that sends no series fields gets a task without a series', () => {
    const { seriesId, repeatAnchor, ...legacy } = validTask;
    const parsed = parseTask(legacy);
    assert.deepEqual([parsed.seriesId, parsed.repeatAnchor], [null, null]);
  });

  test('fields that depend on each other are made to agree', () => {
    const open = parseTask({ ...validTask, done: false, completedAt: 123 });
    assert.equal(open.completedAt, null);
    assert.equal(parseTask({ ...validTask, remindMe: false }).remindMe, true); // alerts exist
    assert.equal(parseTask({ ...validTask, remindMe: true, remindOffsets: [] }).remindMe, false);
    const undated = parseTask({ ...validTask, dueDate: null });
    assert.deepEqual([undated.repeat, undated.seriesId, undated.repeatAnchor], [null, null, null]);
    const noRepeat = parseTask({ ...validTask, repeat: null });
    assert.deepEqual([noRepeat.seriesId, noRepeat.repeatAnchor], [null, null]);
  });

  test('a finished task without a completion time is kept (done before it was tracked)', () => {
    assert.equal(parseTask({ ...validTask, done: true, completedAt: null }).completedAt, null);
  });

  test('rejects an unknown repeat rule', () => {
    assertRejects(() => parseTask({ ...validTask, repeat: 'hourly' }), 'INVALID_TASK');
    assertRejects(() => parseTask({ ...validTask, repeat: 7 }), 'INVALID_TASK');
  });

  const valid: [string, Partial<Task>][] = [
    ['null tag', { tag: null }],
    ['null dueDate', { dueDate: null, repeat: null, seriesId: null, repeatAnchor: null }],
    ['null remindTime', { remindTime: null, remindMe: false, remindOffsets: [] }],
    ['empty description', { description: '' }],
    ['leap day', { dueDate: '2028-02-29' }],
    ['midnight', { remindTime: '00:00' }],
    ['no alerts', { remindOffsets: [], remindMe: false }],
    ['five alerts', { remindOffsets: [0, 5, 60, 1440, 43200] }],
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
    ['createdAt fractional (BIGINT would 500)', { ...validTask, createdAt: 1.5 }],
    ['createdAt negative', { ...validTask, createdAt: -5 }],
    ['createdAt beyond BIGINT / safe integers', { ...validTask, createdAt: 1e300 }],
    ['completedAt fractional', { ...validTask, completedAt: 1.5 }],
    ['completedAt negative', { ...validTask, completedAt: -1 }],
    ['title over the limit', { ...validTask, title: 'a'.repeat(MAX_TITLE_LENGTH + 1) }],
    ['title with NUL (Postgres would 500)', { ...validTask, title: 'a\u0000b' }],
    ['description over the limit', { ...validTask, description: 'a'.repeat(MAX_DESCRIPTION_LENGTH + 1) }],
    ['description with NUL', { ...validTask, description: '\u0000' }],
    ['id with NUL', { ...validTask, id: 'a\u0000' }],
    ['seriesId too long', { ...validTask, seriesId: 'x'.repeat(MAX_ID_LENGTH + 1) }],
    ['repeatAnchor not a date', { ...validTask, repeatAnchor: '2026-02-30' }],
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
    ['remindOffsets not an array', { ...validTask, remindOffsets: 60 }],
    ['remindOffsets with a string', { ...validTask, remindOffsets: [0, '60'] }],
    ['remindOffsets negative', { ...validTask, remindOffsets: [-5] }],
    ['remindOffsets fractional', { ...validTask, remindOffsets: [1.5] }],
    ['remindOffsets over 30 days', { ...validTask, remindOffsets: [43201] }],
    ['remindOffsets duplicated', { ...validTask, remindOffsets: [60, 60] }],
    ['remindOffsets over the cap', { ...validTask, remindOffsets: [0, 1, 2, 3, 4, 5] }],
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

describe('parseTaskPatch keeps dependent fields in step', () => {
  const NOW = 1_800_000_000_000;
  test('done: true without a time stamps it', () => {
    assert.deepEqual(parseTaskPatch({ done: true }, NOW), { done: true, completedAt: NOW });
  });
  test('done: true with its own time keeps that time', () => {
    assert.deepEqual(parseTaskPatch({ done: true, completedAt: 5 }, NOW), { done: true, completedAt: 5 });
  });
  test('done: false clears the time', () => {
    assert.deepEqual(parseTaskPatch({ done: false }, NOW), { done: false, completedAt: null });
    assert.deepEqual(parseTaskPatch({ done: false, completedAt: 7 }, NOW), { done: false, completedAt: null });
  });
  test('a change that does not touch done leaves completedAt alone', () => {
    assert.deepEqual(parseTaskPatch({ title: 'x' }, NOW), { title: 'x' });
  });
  test('alerts decide remindMe', () => {
    assert.deepEqual(parseTaskPatch({ remindOffsets: [0, 60] }, NOW), { remindOffsets: [0, 60], remindMe: true });
    assert.deepEqual(parseTaskPatch({ remindOffsets: [] }, NOW), { remindOffsets: [], remindMe: false });
  });
  test('turning repeat off ends the series', () => {
    assert.deepEqual(parseTaskPatch({ repeat: null }, NOW), { repeat: null, seriesId: null, repeatAnchor: null });
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
    ['name over the limit', { ...validBirthday, name: 'a'.repeat(MAX_NAME_LENGTH + 1) }],
    ['name with NUL (Postgres would 500)', { ...validBirthday, name: 'A\u0000' }],
  ];
  for (const [name, body] of invalid) {
    test(`rejects ${name} with 400 INVALID_BIRTHDAY`, () => {
      assertRejects(() => parseBirthday(body), 'INVALID_BIRTHDAY');
    });
  }
});

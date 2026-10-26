import assert from 'node:assert/strict';
import { after, before, describe, mock, test } from 'node:test';

import { parseSmartDate, parseSpokenTask, suggestImportance } from '@/utils/smart-task';

// "Now" is Monday 2026-10-26 10:00 local, so relative dates are deterministic.
before(() => mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 26, 10, 0, 0) }));
after(() => mock.timers.reset());

describe('parseSpokenTask: equivalence classes', () => {
  test('ru: relative day is cut out of the title', () => {
    assert.deepEqual(parseSpokenTask('купить хлеб завтра', 'ru'), { title: 'купить хлеб', date: '2026-10-27', time: null });
  });
  test('ru: weekday + clock time', () => {
    const r = parseSpokenTask('встреча с Олей в пятницу в 18:30', 'ru');
    assert.equal(r.date, '2026-10-30');
    assert.equal(r.time, '18:30');
    assert.ok(r.title.startsWith('встреча с Олей'), r.title);
    assert.ok(!/пятниц|18:30/.test(r.title), `date words left in the title: "${r.title}"`);
  });
  test('en: tomorrow at 5pm', () => {
    const r = parseSpokenTask('call mom tomorrow at 5pm', 'en');
    assert.deepEqual([r.title, r.date, r.time], ['call mom', '2026-10-27', '17:00']);
  });
  test('en: no date words -> unchanged title, null date/time', () => {
    assert.deepEqual(parseSpokenTask('  buy milk ', 'en'), { title: 'buy milk', date: null, time: null });
  });
  test('only a date -> title falls back to the original text', () => {
    const r = parseSpokenTask('завтра', 'ru');
    assert.equal(r.title, 'завтра');
    assert.equal(r.date, '2026-10-27');
  });
  test('empty and whitespace input', () => {
    assert.deepEqual(parseSpokenTask('', 'en'), { title: '', date: null, time: null });
    assert.deepEqual(parseSpokenTask('   ', 'en'), { title: '', date: null, time: null });
  });
  test('unknown locale falls back to English', () => {
    assert.equal(parseSpokenTask('call mom tomorrow', 'xx').date, '2026-10-27');
  });
  test('time without a date means "today" (forwardDate keeps it in the future)', () => {
    const r = parseSpokenTask('pay rent at 3pm', 'en');
    assert.equal(r.time, '15:00');
    assert.equal(r.date, '2026-10-26');
  });
  test('a clock time that already passed today rolls to tomorrow (forwardDate)', () => {
    const r = parseSpokenTask('stretch at 8am', 'en');
    assert.equal(r.time, '08:00');
    assert.equal(r.date, '2026-10-27');
  });
  test('trailing preposition left by the cut is removed (ru "на", en "on")', () => {
    assert.equal(parseSpokenTask('отчёт на пятницу', 'ru').title, 'отчёт');
    assert.equal(parseSpokenTask('report on friday', 'en').title, 'report');
  });
  test('date mid-sentence keeps both halves, whitespace collapsed', () => {
    assert.equal(parseSpokenTask('call tomorrow the dentist', 'en').title, 'call the dentist');
  });
  test('digits that are not dates do not produce a date', () => {
    assert.equal(parseSpokenTask('buy 3 apples', 'en').date, null);
  });
  test('emoji / punctuation titles survive', () => {
    assert.equal(parseSpokenTask('🎂 cake tomorrow!!!', 'en').title.includes('🎂'), true);
  });
  test('very long input does not hang or throw', () => {
    const long = 'word '.repeat(5000) + 'tomorrow';
    assert.equal(parseSpokenTask(long, 'en').date, '2026-10-27');
  });
});

describe('parseSmartDate', () => {
  test('returns an ISO date or null', () => {
    assert.equal(parseSmartDate('lunch tomorrow', 'en'), '2026-10-27');
    assert.equal(parseSmartDate('just a title', 'en'), null);
    assert.equal(parseSmartDate('', 'en'), null);
  });
  test('weekday name never lands in the past (forwardDate); on a Monday, "monday" means today', () => {
    assert.equal(parseSmartDate('gym on friday', 'en'), '2026-10-30');
    assert.equal(parseSmartDate('gym on tuesday', 'en'), '2026-10-27');
    assert.equal(parseSmartDate('gym on monday', 'en'), '2026-10-26');
  });
  test('every supported locale parses its own word for tomorrow', () => {
    const words: Record<string, string> = { ru: 'завтра', en: 'tomorrow', es: 'mañana', fr: 'demain', de: 'morgen', pt: 'amanhã' };
    for (const [locale, word] of Object.entries(words)) {
      assert.equal(parseSmartDate(`x ${word}`, locale), '2026-10-27', locale);
    }
  });
});

describe('suggestImportance: equivalence classes per locale', () => {
  const cases: [string, string, boolean | null][] = [
    ['ru', 'важный отчёт', true],
    ['ru', 'срочно позвонить', false],
    ['ru', 'купить хлеб', null],
    ['ru', 'ВАЖНО!', true],
    ['en', 'important report', true],
    ['en', 'urgent call', false],
    ['en', 'buy bread', null],
    ['es', 'importante', true],
    ['fr', 'tâche importante', true],
    ['de', 'dringend anrufen', false],
    ['pt', 'prazo amanhã', false],
    ['zh', '重要的会议', true],
    ['zh', '今天完成', false],
  ];
  for (const [locale, text, expected] of cases) test(`${locale}: "${text}" -> ${expected}`, () => assert.equal(suggestImportance(text, locale), expected));

  test('inflected forms still match (prefix of a long keyword)', () => {
    assert.equal(suggestImportance('сделать важного клиента', 'ru'), true);
    assert.equal(suggestImportance('reply urgently', 'en'), false);
  });
  test('negation turns the signal off', () => {
    assert.equal(suggestImportance('not important', 'en'), null);
    assert.equal(suggestImportance('не важно', 'ru'), null);
  });
  test('important beats urgent when both appear', () => assert.equal(suggestImportance('urgent and important', 'en'), true));
  test('empty -> null', () => assert.equal(suggestImportance('', 'en'), null));
});

describe('suggestImportance: false positives from substring matching (negative / look-alike words)', () => {
  const lookAlikes: [string, string][] = [
    ['en', 'buy a keyboard'], // contains "key"
    ['en', 'shovel the snow'], // contains "now"
    ['en', 'mustard for lunch'], // contains "must"
    ['en', 'feed the monkey'], // contains "key"
    ['es', 'ir a la playa'], // contains "ya"
    ['ru', 'это неважно'], // "not important" contains "важно"
    ['ru', 'не срочно'], // "not urgent" -> reads as urgent
  ];
  for (const [locale, text] of lookAlikes) {
    test(`${locale}: "${text}" is not a signal`, () => assert.equal(suggestImportance(text, locale), null));
  }
});

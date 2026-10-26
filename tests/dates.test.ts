import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { addDaysISO, dayDiffFromToday, formatDueDate, isoDateOf, nextBirthdayDayDiff } from '@/utils/dates';

import { tr } from './helpers';

describe('dayDiffFromToday: equivalence classes + boundaries', () => {
  const cases: [string, string, string, number][] = [
    ['same day', '2026-10-26', '2026-10-26', 0],
    ['tomorrow', '2026-10-27', '2026-10-26', 1],
    ['yesterday', '2026-10-25', '2026-10-26', -1],
    ['month boundary (30 -> 1)', '2026-11-01', '2026-10-31', 1],
    ['year boundary', '2027-01-01', '2026-12-31', 1],
    ['non-leap Feb -> Mar', '2026-03-01', '2026-02-28', 1],
    ['leap Feb -> Mar', '2028-03-01', '2028-02-28', 2],
    ['full non-leap year', '2027-10-26', '2026-10-26', 365],
    ['full leap span', '2029-02-28', '2028-02-28', 366],
    ['far past', '2000-01-01', '2026-10-26', -9795],
    // Daylight-saving transitions are 23h / 25h days; the diff must still be whole days.
    ['US spring-forward day', '2026-03-09', '2026-03-08', 1],
    ['US fall-back day', '2026-11-02', '2026-11-01', 1],
    ['EU spring-forward day', '2026-03-30', '2026-03-29', 1],
    ['EU fall-back day', '2026-10-26', '2026-10-25', 1],
    ['across a whole DST week', '2026-03-31', '2026-03-24', 7],
  ];
  for (const [name, date, today, expected] of cases) {
    test(name, () => assert.equal(dayDiffFromToday(date, today), expected));
  }
});

describe('addDaysISO', () => {
  const cases: [string, string, number, string][] = [
    ['zero', '2026-10-26', 0, '2026-10-26'],
    ['+1', '2026-10-26', 1, '2026-10-27'],
    ['-1', '2026-10-26', -1, '2026-10-25'],
    ['month end', '2026-10-31', 1, '2026-11-01'],
    ['year end', '2026-12-31', 1, '2027-01-01'],
    ['year start backwards', '2027-01-01', -1, '2026-12-31'],
    ['leap day reached', '2028-02-28', 1, '2028-02-29'],
    ['leap day skipped in non-leap year', '2026-02-28', 1, '2026-03-01'],
    ['over DST spring-forward', '2026-03-28', 2, '2026-03-30'],
    ['over DST fall-back', '2026-10-24', 2, '2026-10-26'],
    ['large jump', '2026-01-01', 365, '2027-01-01'],
  ];
  for (const [name, start, days, expected] of cases) {
    test(name, () => assert.equal(addDaysISO(start, days), expected));
  }

  test('inverse property: addDaysISO then dayDiffFromToday returns the same offset', () => {
    for (const start of ['2026-01-31', '2026-03-08', '2026-03-29', '2026-10-25', '2026-11-01', '2028-02-29']) {
      for (let days = -400; days <= 400; days += 7) {
        assert.equal(dayDiffFromToday(addDaysISO(start, days), start), days, `${start} ${days}`);
      }
    }
  });
});

describe('isoDateOf', () => {
  test('local calendar date of a timestamp, zero-padded', () => {
    assert.equal(isoDateOf(new Date(2026, 0, 5, 23, 59, 59).getTime()), '2026-01-05');
    assert.equal(isoDateOf(new Date(2026, 0, 5, 0, 0, 0).getTime()), '2026-01-05');
    assert.equal(isoDateOf(new Date(2026, 11, 31, 12).getTime()), '2026-12-31');
  });
});

describe('nextBirthdayDayDiff', () => {
  test('today is the birthday -> 0', () => assert.equal(nextBirthdayDayDiff('1990-10-26', '2026-10-26'), 0));
  test('tomorrow -> 1', () => assert.equal(nextBirthdayDayDiff('1990-10-27', '2026-10-26'), 1));
  test('yesterday -> a year minus a day', () => assert.equal(nextBirthdayDayDiff('1990-10-25', '2026-10-26'), 364));
  test('rolls over the year boundary', () => assert.equal(nextBirthdayDayDiff('1990-01-02', '2026-12-31'), 2));
  test('year of birth is irrelevant', () => {
    assert.equal(nextBirthdayDayDiff('1950-05-05', '2026-05-01'), nextBirthdayDayDiff('2020-05-05', '2026-05-01'));
  });
  test('birthday after a leap day counts the leap day', () => {
    assert.equal(nextBirthdayDayDiff('1990-03-01', '2028-02-28'), 2);
  });

  test('Feb 29 birthday: always a sane, non-negative distance (<= 366)', () => {
    for (const today of ['2026-02-28', '2026-03-01', '2027-03-02', '2028-02-28', '2028-02-29', '2028-03-01', '2029-01-01']) {
      const diff = nextBirthdayDayDiff('2000-02-29', today);
      assert.ok(Number.isInteger(diff) && diff >= 0 && diff <= 366, `${today} -> ${diff}`);
    }
  });

  test('exhaustive invariant: every day of a year, vs. several "today"s, stays within 0..365/366', () => {
    for (const today of ['2026-01-01', '2026-03-08', '2026-10-25', '2027-12-31', '2028-02-29']) {
      for (let day = 0; day < 366; day++) {
        const date = addDaysISO('2027-01-01', day);
        const diff = nextBirthdayDayDiff(`1990${date.slice(4)}`, today);
        assert.ok(Number.isInteger(diff) && diff >= 0 && diff <= 366, `${today} ${date} -> ${diff}`);
      }
    }
  });
});

describe('formatDueDate', () => {
  test('today / tomorrow use words, others use a short date', () => {
    assert.equal(formatDueDate('2026-10-26', tr, 'en', '2026-10-26'), 'calendar.today');
    assert.equal(formatDueDate('2026-10-27', tr, 'en', '2026-10-26'), 'calendar.tomorrow');
    assert.match(formatDueDate('2026-11-05', tr, 'en', '2026-10-26'), /Nov/);
    assert.match(formatDueDate('2026-10-25', tr, 'en', '2026-10-26'), /Oct/); // yesterday is a date, not a word
  });
});

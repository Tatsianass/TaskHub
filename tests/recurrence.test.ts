import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { isFollowUp, nextDueDate, nextOccurrence, withSeries } from '@/utils/recurrence';

import { makeTask } from './helpers';

describe('nextDueDate', () => {
  const rows: [string, Parameters<typeof nextDueDate>, string][] = [
    ['daily, finished on the day', ['daily', '2026-11-07', '2026-11-07'], '2026-11-08'],
    ['daily, finished early', ['daily', '2026-11-20', '2026-11-07'], '2026-11-21'],
    ['daily, long overdue jumps to the first future day', ['daily', '2026-11-01', '2026-11-07'], '2026-11-08'],
    ['weekly keeps the weekday', ['weekly', '2026-11-02', '2026-11-02'], '2026-11-09'],
    ['weekly, overdue stays on the same weekday', ['weekly', '2026-11-02', '2026-11-07'], '2026-11-09'],
    ['monthly', ['monthly', '2026-11-01', '2026-11-01'], '2026-12-01'],
    ['monthly rolls over the year', ['monthly', '2026-12-15', '2026-12-15'], '2027-01-15'],
    ['monthly on the 31st clamps to the short month', ['monthly', '2026-01-31', '2026-01-31'], '2026-02-28'],
    ['monthly on the 31st is not stuck on the 28th when catching up', ['monthly', '2026-01-31', '2026-02-28'], '2026-03-31'],
    ['monthly, three months late', ['monthly', '2026-08-01', '2026-11-07'], '2026-12-01'],
    ['yearly', ['yearly', '2026-11-07', '2026-11-07'], '2027-11-07'],
    ['yearly on 29 Feb clamps in a common year', ['yearly', '2028-02-29', '2028-02-29'], '2029-02-28'],
    // The anchor is the series' original date: a short month must not move the task for good.
    ['monthly on the 31st returns from the 28th to the 31st', ['monthly', '2026-02-28', '2026-02-28', '2026-01-31'], '2026-03-31'],
    ['monthly 31st, 30-day month then back', ['monthly', '2026-03-31', '2026-03-31', '2026-01-31'], '2026-04-30'],
    ['monthly 31st through a leap February', ['monthly', '2028-01-31', '2028-01-31', '2028-01-31'], '2028-02-29'],
    ['monthly 31st over twelve completions never drifts', ['monthly', '2026-11-30', '2026-11-30', '2026-01-31'], '2026-12-31'],
    ['monthly moved earlier in its month: the anchor day is still ahead', ['monthly', '2026-03-05', '2026-03-05', '2026-03-28'], '2026-03-28'],
    ['yearly 29 Feb returns after a common year', ['yearly', '2029-02-28', '2029-02-28', '2028-02-29'], '2030-02-28'],
    ['yearly 29 Feb on the next leap year', ['yearly', '2031-02-28', '2031-02-28', '2028-02-29'], '2032-02-29'],
    ['weekdays: Friday to Monday', ['weekdays', '2026-11-06', '2026-11-06'], '2026-11-09'],
    ['weekdays: Monday to Tuesday', ['weekdays', '2026-11-02', '2026-11-02'], '2026-11-03'],
    ['weekdays: overdue task finished on a Saturday', ['weekdays', '2026-11-02', '2026-11-07'], '2026-11-09'],
  ];
  for (const [name, args, expected] of rows) test(name, () => assert.equal(nextDueDate(...args), expected));
});

describe('a monthly task on the 31st over a whole year of completions', () => {
  test('lands on the last day it can in every month, never stuck on the 28th', () => {
    let task = makeTask({ repeat: 'monthly', dueDate: '2026-01-31', seriesId: 's', repeatAnchor: '2026-01-31' });
    const seen: string[] = [];
    for (let i = 0; i < 12; i++) {
      const next = nextOccurrence(task, `n${i}`, 1, task.dueDate!)!;
      seen.push(next.dueDate!);
      task = next;
    }
    assert.deepEqual(seen, [
      '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30', '2026-07-31',
      '2026-08-31', '2026-09-30', '2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31',
    ]);
  });

  test('yearly 29 Feb is back on the 29th in the next leap year', () => {
    let task = makeTask({ repeat: 'yearly', dueDate: '2028-02-29', seriesId: 's', repeatAnchor: '2028-02-29' });
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      task = nextOccurrence(task, `n${i}`, 1, task.dueDate!)!;
      seen.push(task.dueDate!);
    }
    assert.deepEqual(seen, ['2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29']);
  });
});

describe('withSeries', () => {
  test('gives a repeating task a series and its starting date, once', () => {
    const task = makeTask({ repeat: 'weekly', dueDate: '2026-11-02' });
    const first = withSeries(task, () => 'S1');
    assert.deepEqual([first.seriesId, first.repeatAnchor], ['S1', '2026-11-02']);
    const again = withSeries({ ...first, dueDate: '2026-11-09' }, () => 'S2');
    assert.deepEqual([again.seriesId, again.repeatAnchor], ['S1', '2026-11-02']);
  });

  test('a task that does not repeat, or has no date, has no series', () => {
    const oneOff = withSeries(makeTask({ repeat: null, dueDate: '2026-11-02', seriesId: 'x', repeatAnchor: 'y' }), () => 'S');
    assert.deepEqual([oneOff.seriesId, oneOff.repeatAnchor], [null, null]);
    const noDate = withSeries(makeTask({ repeat: 'daily', dueDate: null }), () => 'S');
    assert.deepEqual([noDate.seriesId, noDate.repeatAnchor], [null, null]);
  });
});

describe('nextOccurrence', () => {
  const base = { repeat: 'weekly' as const, dueDate: '2026-11-02', title: 'Rent', description: 'flat', tag: 'home' as const, remindOffsets: [0, 60], remindMe: true, remindTime: '09:00' };

  test('copies the task onto the next date as a fresh, open task', () => {
    const done = makeTask({ ...base, done: true, completedAt: 5 });
    const next = nextOccurrence(done, 'new', 99, '2026-11-02');
    assert.ok(next);
    assert.equal(next.id, 'new');
    assert.equal(next.createdAt, 99);
    assert.equal(next.dueDate, '2026-11-09');
    assert.equal(next.done, false);
    assert.equal(next.completedAt, null);
    assert.deepEqual([next.title, next.description, next.tag, next.remindOffsets, next.remindTime, next.repeat], ['Rent', 'flat', 'home', [0, 60], '09:00', 'weekly']);
  });

  test('is null for a task that does not repeat or has no date', () => {
    assert.equal(nextOccurrence(makeTask({ dueDate: '2026-11-02' }), 'n', 1, '2026-11-02'), null);
    assert.equal(nextOccurrence(makeTask({ repeat: 'daily', dueDate: null }), 'n', 1, '2026-11-02'), null);
    assert.equal(nextOccurrence(makeTask({ repeat: undefined as never, dueDate: '2026-11-02' }), 'n', 1, '2026-11-02'), null);
  });

  test('urgency follows the new date, importance is kept', () => {
    const daily = makeTask({ repeat: 'daily', dueDate: '2026-11-02', quadrantId: 'urgent-important' });
    assert.equal(nextOccurrence(daily, 'n', 1, '2026-11-02')?.quadrantId, 'urgent-important'); // tomorrow is still urgent
    const monthly = makeTask({ repeat: 'monthly', dueDate: '2026-11-02', quadrantId: 'urgent-important' });
    assert.equal(nextOccurrence(monthly, 'n', 1, '2026-11-02')?.quadrantId, 'not-urgent-important');
    const unimportant = makeTask({ repeat: 'monthly', dueDate: '2026-11-02', quadrantId: 'urgent-not-important' });
    assert.equal(nextOccurrence(unimportant, 'n', 1, '2026-11-02')?.quadrantId, 'not-urgent-not-important');
  });
});

describe('isFollowUp', () => {
  const done = makeTask({ repeat: 'weekly', dueDate: '2026-11-02', title: 'Rent', done: true });

  test('matches an open task with the same title and rule due later', () => {
    assert.equal(isFollowUp(done, makeTask({ repeat: 'weekly', dueDate: '2026-11-09', title: 'Rent' })), true);
  });

  test('a look-alike task of another series is not the follow-up (same title, same rule)', () => {
    const mine = makeTask({ repeat: 'weekly', dueDate: '2026-11-02', title: 'Workout', done: true, seriesId: 'mon' });
    const thursdays = makeTask({ repeat: 'weekly', dueDate: '2026-11-05', title: 'Workout', seriesId: 'thu' });
    assert.equal(isFollowUp(mine, thursdays), false);
    assert.equal(isFollowUp(mine, { ...thursdays, seriesId: 'mon' }), true);
  });

  test('a task from before series existed still matches by title and rule', () => {
    assert.equal(isFollowUp(done, makeTask({ repeat: 'weekly', dueDate: '2026-11-09', title: 'Rent' })), true);
    // ...but a task that belongs to a series is never the follow-up of one that does not.
    assert.equal(isFollowUp(done, makeTask({ repeat: 'weekly', dueDate: '2026-11-09', title: 'Rent', seriesId: 'x' })), false);
  });

  for (const [name, other] of [
    ['a completed one', makeTask({ repeat: 'weekly', dueDate: '2026-11-09', title: 'Rent', done: true })],
    ['another title', makeTask({ repeat: 'weekly', dueDate: '2026-11-09', title: 'Gym' })],
    ['another rule', makeTask({ repeat: 'daily', dueDate: '2026-11-09', title: 'Rent' })],
    ['an earlier date', makeTask({ repeat: 'weekly', dueDate: '2026-11-01', title: 'Rent' })],
  ] as const) {
    test(`does not match ${name}`, () => assert.equal(isFollowUp(done, other), false));
  }
});

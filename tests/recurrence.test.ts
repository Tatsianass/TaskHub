import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { isFollowUp, nextDueDate, nextOccurrence } from '@/utils/recurrence';

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
    ['weekdays: Friday to Monday', ['weekdays', '2026-11-06', '2026-11-06'], '2026-11-09'],
    ['weekdays: Monday to Tuesday', ['weekdays', '2026-11-02', '2026-11-02'], '2026-11-03'],
    ['weekdays: overdue task finished on a Saturday', ['weekdays', '2026-11-02', '2026-11-07'], '2026-11-09'],
  ];
  for (const [name, args, expected] of rows) test(name, () => assert.equal(nextDueDate(...args), expected));
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

  for (const [name, other] of [
    ['a completed one', makeTask({ repeat: 'weekly', dueDate: '2026-11-09', title: 'Rent', done: true })],
    ['another title', makeTask({ repeat: 'weekly', dueDate: '2026-11-09', title: 'Gym' })],
    ['another rule', makeTask({ repeat: 'daily', dueDate: '2026-11-09', title: 'Rent' })],
    ['an earlier date', makeTask({ repeat: 'weekly', dueDate: '2026-11-01', title: 'Rent' })],
  ] as const) {
    test(`does not match ${name}`, () => assert.equal(isFollowUp(done, other), false));
  }
});

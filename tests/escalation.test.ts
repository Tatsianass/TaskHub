import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { addDaysISO } from '@/utils/dates';
import { daysOverdue, overdueTasks } from '@/utils/overdue';
import { effectiveQuadrantId, isEscalated, urgentCounterpart } from '@/utils/priority';
import type { QuadrantId } from '@/types/task';

import { QUADRANT_IDS, makeTask } from './helpers';

const TODAY = '2026-10-26';
const WINDOWS = [null, 0, 1, 3, 7, 30];
/** Due date relative to today; `undefined` = no due date. */
const DUE_OFFSETS = [undefined, -30, -1, 0, 1, 2, 3, 4, 6, 7, 8, 29, 30, 31, 365];

/** Independent oracle for the rule, written from the spec (not from the implementation). */
function expectedQuadrant(quadrant: QuadrantId, window: number | null, due: number | undefined): QuadrantId {
  if (window === null || due === undefined) return quadrant;
  if (due > window) return quadrant;
  if (quadrant === 'not-urgent-important') return 'urgent-important';
  if (quadrant === 'not-urgent-not-important') return 'urgent-not-important';
  return quadrant;
}

describe('deadline escalation: full decision table (4 quadrants x 6 windows x 15 due dates)', () => {
  for (const quadrant of QUADRANT_IDS) {
    for (const window of WINDOWS) {
      for (const due of DUE_OFFSETS) {
        test(`${quadrant} | window=${window} | due=${due === undefined ? 'none' : `today${due >= 0 ? '+' : ''}${due}`}`, () => {
          const task = makeTask({ quadrantId: quadrant, dueDate: due === undefined ? null : addDaysISO(TODAY, due) });
          const expected = expectedQuadrant(quadrant, window, due);
          assert.equal(effectiveQuadrantId(task, window, TODAY), expected);
          assert.equal(task.quadrantId, quadrant, 'the stored quadrant is never mutated');
          assert.equal(isEscalated(task, window, TODAY), expected !== quadrant);
        });
      }
    }
  }
});

describe('escalation: boundary values around the window edge', () => {
  for (const window of [0, 1, 7, 30]) {
    test(`window ${window}: due in ${window + 1} days stays, in ${window} days moves, in ${window - 1} days moves`, () => {
      const at = (offset: number) =>
        effectiveQuadrantId(makeTask({ dueDate: addDaysISO(TODAY, offset) }), window, TODAY);
      assert.equal(at(window + 1), 'not-urgent-important');
      assert.equal(at(window), 'urgent-important');
      assert.equal(at(window - 1), 'urgent-important');
    });
  }
  test('overdue tasks are escalated too (their diff is negative)', () => {
    assert.equal(effectiveQuadrantId(makeTask({ dueDate: '2020-01-01' }), 0, TODAY), 'urgent-important');
  });
});

describe('escalation: done tasks and counterparts', () => {
  test('a done task is never "escalated" (no 🔥 / banner), but keeps the quadrant it was escalated to', () => {
    const task = makeTask({ done: true, dueDate: TODAY });
    assert.equal(isEscalated(task, 7, TODAY), false);
    assert.equal(effectiveQuadrantId(task, 7, TODAY), 'urgent-important');
  });
  test('urgentCounterpart maps only the two non-urgent quadrants', () => {
    assert.equal(urgentCounterpart('not-urgent-important'), 'urgent-important');
    assert.equal(urgentCounterpart('not-urgent-not-important'), 'urgent-not-important');
    assert.equal(urgentCounterpart('urgent-important'), undefined);
    assert.equal(urgentCounterpart('urgent-not-important'), undefined);
  });
});

describe('escalation: state transitions over time (a task "travelling" between sections)', () => {
  test('days pass: stays, moves in exactly on the window day, stays moved, then is overdue', () => {
    const task = makeTask({ dueDate: '2026-11-05' }); // window 7 -> moves on 2026-10-29
    const path = ['2026-10-28', '2026-10-29', '2026-10-30', '2026-11-05', '2026-11-06'].map(
      (today) => `${today}:${effectiveQuadrantId(task, 7, today)}`,
    );
    assert.deepEqual(path, [
      '2026-10-28:not-urgent-important',
      '2026-10-29:urgent-important',
      '2026-10-30:urgent-important',
      '2026-11-05:urgent-important',
      '2026-11-06:urgent-important',
    ]);
  });

  test('due date moved further out -> the task returns to its own section; moved back -> escalates again', () => {
    const base = makeTask({ dueDate: addDaysISO(TODAY, 3) });
    assert.equal(effectiveQuadrantId(base, 7, TODAY), 'urgent-important');
    assert.equal(effectiveQuadrantId({ ...base, dueDate: addDaysISO(TODAY, 20) }, 7, TODAY), 'not-urgent-important');
    assert.equal(effectiveQuadrantId({ ...base, dueDate: addDaysISO(TODAY, 2) }, 7, TODAY), 'urgent-important');
    assert.equal(effectiveQuadrantId({ ...base, dueDate: null }, 7, TODAY), 'not-urgent-important');
  });

  test('widening / narrowing / switching off the window re-evaluates every task', () => {
    const task = makeTask({ dueDate: addDaysISO(TODAY, 5) });
    const seen = [null, 3, 5, 10, null].map((window) => effectiveQuadrantId(task, window, TODAY));
    assert.deepEqual(seen, [
      'not-urgent-important',
      'not-urgent-important',
      'urgent-important',
      'urgent-important',
      'not-urgent-important',
    ]);
  });

  test('the task itself edited into an urgent quadrant is simply not escalated (no double move)', () => {
    const task = makeTask({ quadrantId: 'urgent-important', dueDate: TODAY });
    assert.equal(isEscalated(task, 7, TODAY), false);
  });
});

describe('overdueTasks / daysOverdue', () => {
  const open = (due: string | null, extra = {}) => makeTask({ dueDate: due, ...extra });

  test('partitions: yesterday and older are overdue; today, future, no date and done are not', () => {
    const tasks = [
      open('2026-10-25'),
      open('2026-10-26'),
      open('2026-10-27'),
      open(null),
      open('2026-10-01', { done: true }),
      open('2000-01-01'),
    ];
    assert.deepEqual(overdueTasks(tasks, TODAY).map((task) => task.dueDate), ['2000-01-01', '2026-10-25']);
  });

  test('longest overdue first; ties broken by creation order; input is not mutated', () => {
    const a = open('2026-10-20', { createdAt: 5 });
    const b = open('2026-10-20', { createdAt: 2 });
    const c = open('2026-10-10', { createdAt: 9 });
    const input = [a, b, c];
    assert.deepEqual(overdueTasks(input, TODAY), [c, b, a]);
    assert.deepEqual(input, [a, b, c]);
  });

  test('daysOverdue: 0 for today/future/no date, N for N days late', () => {
    assert.equal(daysOverdue({ dueDate: null }, TODAY), 0);
    assert.equal(daysOverdue({ dueDate: '2026-10-27' }, TODAY), 0);
    assert.equal(daysOverdue({ dueDate: TODAY }, TODAY), 0);
    assert.equal(daysOverdue({ dueDate: '2026-10-25' }, TODAY), 1);
    assert.equal(daysOverdue({ dueDate: '2025-10-26' }, TODAY), 365);
  });
});

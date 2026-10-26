import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { addDaysISO } from '@/utils/dates';
import { morningDigest, type DigestOptions } from '@/utils/morning-digest';
import { effectiveQuadrantId } from '@/utils/priority';

import { makeTask } from './helpers';

const TODAY = '2026-10-26';
const ON: DigestOptions = { escalationDays: 7, soon: true, overdue: true };
const due = (offset: number, extra = {}) => makeTask({ dueDate: addDaysISO(TODAY, offset), ...extra });
const summary = (tasks: ReturnType<typeof makeTask>[], day: string, options: DigestOptions) =>
  morningDigest(tasks, day, options).map((item) => `${item.task.id}:${item.kind}`);

describe('morning digest: decision table (one task at a time)', () => {
  // columns: description, task, expected kind on TODAY with ON (or null = not mentioned)
  const rows: [string, ReturnType<typeof makeTask>, string | null][] = [
    ['no due date', makeTask(), null],
    ['done and due today', due(0, { done: true }), null],
    ['done and overdue', due(-3, { done: true }), null],
    ['overdue', due(-1), 'overdue'],
    ['due today, no own alert', due(0), 'today'],
    ['due tomorrow, no own alert', due(1), 'tomorrow'],
    ['due in 2 days (inside window, not escalating today)', due(2), null],
    ['due today but has its own alert', due(0, { remindMe: true, remindOffsets: [0] }), null],
    ['due tomorrow but has its own alert', due(1, { remindOffsets: [60] }), null],
    ['overdue even with its own alert (the alert is gone)', due(-1, { remindOffsets: [0] }), 'overdue'],
    ['exactly 7 days out, not-urgent -> escalates today', due(7), 'escalated'],
    ['exactly 7 days out, already urgent -> nothing to announce', due(7, { quadrantId: 'urgent-important' }), null],
    ['8 days out', due(8), null],
    ['6 days out (escalated yesterday, not announced again)', due(6), null],
    ['not-urgent-not-important 7 days out -> escalates', due(7, { quadrantId: 'not-urgent-not-important' }), 'escalated'],
    ['urgent task due today still gets the "today" line', due(0, { quadrantId: 'urgent-important' }), 'today'],
    ['legacy remindMe=true without offsets counts as having an alert', due(0, { remindMe: true, remindOffsets: undefined as never }), null],
  ];
  for (const [name, task, kind] of rows) {
    test(name, () => {
      const items = morningDigest([task], TODAY, ON);
      assert.deepEqual(items.map((item) => item.kind), kind ? [kind] : []);
    });
  }
});

describe('morning digest: option switches', () => {
  const tasks = [due(7), due(-2), due(0), due(1)];
  test('everything on', () => {
    assert.deepEqual(summary(tasks, TODAY, ON).map((x) => x.split(':')[1]), ['escalated', 'overdue', 'today', 'tomorrow']);
  });
  test('digest off, overdue on -> only overdue', () => {
    assert.deepEqual(summary(tasks, TODAY, { ...ON, soon: false }).map((x) => x.split(':')[1]), ['overdue']);
  });
  test('digest on, overdue off -> no overdue', () => {
    assert.deepEqual(summary(tasks, TODAY, { ...ON, overdue: false }).map((x) => x.split(':')[1]), ['escalated', 'today', 'tomorrow']);
  });
  test('escalation off (null) keeps due-soon lines', () => {
    assert.deepEqual(summary(tasks, TODAY, { ...ON, escalationDays: null }).map((x) => x.split(':')[1]), ['overdue', 'today', 'tomorrow']);
  });
  test('everything off -> nothing', () => {
    assert.deepEqual(morningDigest(tasks, TODAY, { escalationDays: null, soon: false, overdue: false }), []);
  });
  test('soon=false suppresses escalation announcements too (single "morning summary" switch)', () => {
    assert.ok(!summary([due(7)], TODAY, { ...ON, soon: false }).some((x) => x.endsWith('escalated')));
  });
});

describe('morning digest: deduplication (a task is mentioned once per morning)', () => {
  test('window 1: due tomorrow is both "escalated" and "tomorrow" -> escalated only', () => {
    const task = due(1);
    assert.deepEqual(morningDigest([task], TODAY, { ...ON, escalationDays: 1 }).map((i) => i.kind), ['escalated']);
  });
  test('window 0: due today is both "escalated" and "today" -> escalated only', () => {
    const task = due(0);
    assert.deepEqual(morningDigest([task], TODAY, { ...ON, escalationDays: 0 }).map((i) => i.kind), ['escalated']);
  });
  test('no id appears twice for any window in a mixed backlog on any of 40 days', () => {
    const tasks = [-5, -1, 0, 1, 2, 7, 8, 14, 30].flatMap((offset) => [due(offset), due(offset, { quadrantId: 'not-urgent-not-important' })]);
    for (const escalationDays of [null, 0, 1, 2, 7, 14]) {
      for (let d = -3; d < 37; d++) {
        const ids = morningDigest(tasks, addDaysISO(TODAY, d), { escalationDays, soon: true, overdue: true }).map((i) => i.task.id);
        assert.equal(new Set(ids).size, ids.length, `window ${escalationDays}, day +${d}`);
      }
    }
  });
});

describe('morning digest: a task "travelling" across two weeks (state-transition view)', () => {
  const task = due(10); // due 2026-11-05, window 7 -> escalates on 10-29
  const timeline = Array.from({ length: 14 }, (_, d) => {
    const day = addDaysISO(TODAY, d);
    return `${day}:${morningDigest([task], day, ON).map((i) => i.kind).join('+') || '-'}`;
  });

  test('exact timeline: silent, one escalation announcement, quiet, then tomorrow/today/overdue', () => {
    assert.deepEqual(timeline, [
      '2026-10-26:-',
      '2026-10-27:-',
      '2026-10-28:-',
      '2026-10-29:escalated',
      '2026-10-30:-',
      '2026-10-31:-',
      '2026-11-01:-',
      '2026-11-02:-',
      '2026-11-03:-',
      '2026-11-04:tomorrow',
      '2026-11-05:today',
      '2026-11-06:overdue',
      '2026-11-07:overdue',
      '2026-11-08:overdue',
    ]);
  });

  test('anti-nag property: at most 3 pings before the deadline, exactly 1 escalation announcement', () => {
    const before = timeline.filter((line) => line < '2026-11-06' && !line.endsWith(':-'));
    assert.equal(before.length, 3);
    assert.equal(timeline.filter((line) => line.endsWith('escalated')).length, 1);
  });

  test('consistency with the UI rule: the announcement day is the first day the task is displayed as urgent', () => {
    const firstUrgent = Array.from({ length: 14 }, (_, d) => addDaysISO(TODAY, d)).find(
      (day) => effectiveQuadrantId(task, 7, day) === 'urgent-important',
    );
    const announced = Array.from({ length: 14 }, (_, d) => addDaysISO(TODAY, d)).find(
      (day) => morningDigest([task], day, ON).some((i) => i.kind === 'escalated'),
    );
    assert.equal(announced, firstUrgent);
  });

  test('moving the due date after the announcement does not re-announce unless it re-enters the window exactly', () => {
    const moved = { ...task, dueDate: addDaysISO(TODAY, 20) };
    assert.deepEqual(summary([moved], addDaysISO(TODAY, 6), ON), []);
  });
});

describe('morning digest: month-end / year-end / leap-day windows', () => {
  test('escalation across a year boundary', () => {
    const task = makeTask({ dueDate: '2027-01-03' });
    assert.deepEqual(morningDigest([task], '2026-12-27', ON).map((i) => i.kind), ['escalated']);
    assert.deepEqual(morningDigest([task], '2026-12-28', ON).map((i) => i.kind), []);
  });
  test('escalation across a leap day', () => {
    const task = makeTask({ dueDate: '2028-03-05' });
    assert.deepEqual(morningDigest([task], '2028-02-27', ON).map((i) => i.kind), ['escalated']);
  });
});

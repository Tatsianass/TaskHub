import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, mock, test } from 'node:test';

import type { Birthday } from '@/types/birthday';
import type { Task } from '@/types/task';

import { makeTask, tr } from './helpers';

type Scheduled = { title: string; body: string; data?: { taskId?: string }; category?: string; at: Date };
let scheduled: Scheduled[] = [];
let cancelCalls = 0;
let order: string[] = [];
const store = new Map<string, string>();

mock.module('react-native', { exports: { Platform: { OS: 'ios' }, Alert: { alert() {} } } });
mock.module('@react-native-async-storage/async-storage', {
  exports: {
    default: {
      getItem: async (key: string) => store.get(key) ?? null,
      setItem: async (key: string, value: string) => void store.set(key, value),
    },
  },
});
mock.module('expo-notifications', {
  exports: {
    AndroidImportance: { MAX: 5 },
    SchedulableTriggerInputTypes: { DATE: 'date' },
    setNotificationHandler() {},
    setNotificationCategoryAsync: async () => {},
    cancelAllScheduledNotificationsAsync: async () => {
      cancelCalls += 1;
      scheduled = [];
      order.push('cancel');
    },
    scheduleNotificationAsync: async ({ content, trigger }: any) => {
      order.push('schedule');
      await new Promise((resolve) => setImmediate(resolve)); // yield, so overlapping syncs would interleave
      scheduled.push({ title: content.title, body: content.body, data: content.data, category: content.categoryIdentifier, at: trigger.date });
    },
  },
});

let n: typeof import('@/lib/notifications');
before(async () => {
  n = await import('@/lib/notifications');
});

// Monday 2026-10-26 08:00 local.
const NOW = new Date(2026, 9, 26, 8, 0, 0);
beforeEach(() => {
  scheduled = [];
  cancelCalls = 0;
  order = [];
  store.clear();
  mock.timers.reset();
  mock.timers.enable({ apis: ['Date'], now: NOW });
});
after(() => mock.timers.reset());

const d = (offset: number) => {
  const date = new Date(2026, 9, 26 + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const sync = (tasks: Task[], opts: { birthdays?: Birthday[]; morning?: string; overdue?: boolean; digest?: boolean; window?: number | null } = {}) =>
  n.syncReminders(tasks, opts.birthdays ?? [], tr, opts.morning ?? '09:00', opts.overdue ?? true, {
    escalationDays: opts.window === undefined ? 7 : opts.window,
    enabled: opts.digest ?? true,
  });
const hhmm = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
const day = (date: Date) => `${date.getMonth() + 1}-${date.getDate()}`;

describe('resolveAction: every notification button', () => {
  const now = new Date(2026, 9, 31, 22, 30); // Saturday night, month end
  test('done / delete', () => {
    assert.deepEqual(n.resolveAction('done', now, '09:00'), { type: 'done' });
    assert.deepEqual(n.resolveAction('delete', now, '09:00'), { type: 'delete' });
  });
  test('snooze 15 and 60 minutes', () => {
    assert.deepEqual(n.resolveAction('snooze15', now, '09:00'), { type: 'snooze', at: new Date(2026, 9, 31, 22, 45) });
    assert.deepEqual(n.resolveAction('snooze60', now, '09:00'), { type: 'snooze', at: new Date(2026, 9, 31, 23, 30) });
  });
  test('snooze 60 across midnight', () => {
    const late = new Date(2026, 9, 31, 23, 30);
    assert.deepEqual(n.resolveAction('snooze60', late, '09:00'), { type: 'snooze', at: new Date(2026, 10, 1, 0, 30) });
  });
  test('snooze to tomorrow = tomorrow at the morning time (across the month boundary)', () => {
    assert.deepEqual(n.resolveAction('snoozeTomorrow', now, '07:45'), { type: 'snooze', at: new Date(2026, 10, 1, 7, 45) });
  });
  test('postpone moves the due date to tomorrow (month / year ends)', () => {
    assert.deepEqual(n.resolveAction('postponeTomorrow', now, '09:00'), { type: 'postpone', dueDate: '2026-11-01' });
    assert.deepEqual(n.resolveAction('postponeTomorrow', new Date(2026, 11, 31, 12), '09:00'), { type: 'postpone', dueDate: '2027-01-01' });
    assert.deepEqual(n.resolveAction('postponeTomorrow', new Date(2028, 1, 28, 12), '09:00'), { type: 'postpone', dueDate: '2028-02-29' });
  });
  test('plain tap (default action) and unknown ids -> null', () => {
    assert.equal(n.resolveAction('expo.modules.notifications.actions.DEFAULT', now, '09:00'), null);
    assert.equal(n.resolveAction('', now, '09:00'), null);
  });
});

describe('syncReminders: task alerts', () => {
  test('timed task, two alerts: each at its own moment, past ones skipped', async () => {
    const task = makeTask({ dueDate: d(0), remindTime: '15:00', remindOffsets: [0, 60, 600] }); // 600 min before 15:00 = 05:00 (past)
    await sync([task], { overdue: false, digest: false });
    assert.deepEqual(scheduled.map((s) => hhmm(s.at)), ['14:00', '15:00']);
    assert.ok(scheduled.every((s) => s.data?.taskId === task.id));
    assert.match(scheduled[1].body, /15:00/);
  });
  test('all-day task alerts use the morning time', async () => {
    await sync([makeTask({ dueDate: d(2), remindOffsets: [0] })], { morning: '07:30', overdue: false, digest: false });
    assert.deepEqual(scheduled.map((s) => `${day(s.at)} ${hhmm(s.at)}`), ['10-28 07:30']);
  });
  test('done tasks and tasks without a date schedule nothing', async () => {
    await sync([makeTask({ dueDate: d(2), done: true, remindOffsets: [0] }), makeTask({ remindOffsets: [0] })], { overdue: false, digest: false });
    assert.equal(scheduled.length, 0);
  });
  test('boundary: an alert exactly now is not scheduled; one minute ahead is', async () => {
    await sync([makeTask({ dueDate: d(0), remindTime: '08:00', remindOffsets: [0] })], { overdue: false, digest: false });
    assert.equal(scheduled.length, 0);
    await sync([makeTask({ dueDate: d(0), remindTime: '08:01', remindOffsets: [0] })], { overdue: false, digest: false });
    assert.equal(scheduled.length, 1);
  });
  test('legacy task (remindMe, no offsets) alerts once at the reminder time', async () => {
    await sync([makeTask({ dueDate: d(1), remindMe: true, remindOffsets: undefined as never })], { overdue: false, digest: false });
    assert.equal(scheduled.length, 1);
  });
});

describe('syncReminders: morning summary (one notification per morning)', () => {
  test('nothing to say -> nothing scheduled', async () => {
    await sync([makeTask()]);
    assert.equal(scheduled.length, 0);
  });

  test('mixed backlog -> exactly one notification per day, at the morning time, with a count and per-kind parts', async () => {
    const tasks = [
      makeTask({ dueDate: d(7) }), // escalates on d(0)
      makeTask({ dueDate: d(-2) }), // overdue
      makeTask({ dueDate: d(0) }), // today
      makeTask({ dueDate: d(1) }), // tomorrow
    ];
    await sync(tasks);
    const today = scheduled.filter((s) => day(s.at) === '10-26');
    assert.equal(today.length, 1);
    assert.equal(hhmm(today[0].at), '09:00');
    assert.equal(today[0].title, 'notifications.digestTitle|count=4');
    assert.equal(today[0].data, undefined);
    assert.equal(today[0].body.split('\n')[0],
      ['notifications.digest.escalated|count=1', 'notifications.digest.overdue|count=1', 'notifications.digest.today|count=1', 'notifications.digest.tomorrow|count=1'].join(' · '));
    const perDay = new Map<string, number>();
    for (const s of scheduled) perDay.set(day(s.at), (perDay.get(day(s.at)) ?? 0) + 1);
    assert.ok([...perDay.values()].every((count) => count === 1), JSON.stringify([...perDay]));
  });

  test('the morning time of today has already passed -> no ping today, tomorrow still gets one', async () => {
    await sync([makeTask({ dueDate: d(-1) })], { morning: '07:00' });
    assert.deepEqual(scheduled.map((s) => day(s.at)).slice(0, 2), ['10-27', '10-28']);
  });

  test('exactly the morning time now -> today is skipped (strictly in the future only)', async () => {
    await sync([makeTask({ dueDate: d(-1) })], { morning: '08:00' });
    assert.equal(day(scheduled[0].at), '10-27');
  });

  test('a single overdue task keeps its own notification with Done/Move/Delete buttons', async () => {
    const task = makeTask({ dueDate: d(-1), title: 'Pay rent' });
    await sync([task]);
    assert.equal(scheduled[0].title, 'Pay rent');
    assert.equal(scheduled[0].category, 'overdue');
    assert.equal(scheduled[0].data?.taskId, task.id);
    assert.equal(scheduled.length, 7); // one per morning for the next week
  });

  test('a single escalated task is announced by name with the urgent quadrant, with the regular task buttons', async () => {
    const task = makeTask({ dueDate: d(7), title: 'Tax return' });
    await sync([task]);
    const first = scheduled[0];
    assert.equal(first.title, 'Tax return');
    assert.match(first.body, /^notifications\.escalatedBody\|urgent=/);
    assert.equal(first.category, 'task');
    assert.equal(day(first.at), '10-26');
  });

  test('settings: overdue off -> overdue not mentioned; summary off -> only overdue; both off -> silent', async () => {
    const tasks = [makeTask({ dueDate: d(-1) }), makeTask({ dueDate: d(1) })];
    await sync(tasks, { overdue: false });
    assert.ok(scheduled.every((s) => !s.body.includes('digest.overdue') && s.title !== 'notifications.overdueBody'));
    await sync(tasks, { digest: false });
    // Overdue-only: single task -> its own notification; once both are late (later mornings) -> a summary.
    assert.ok(scheduled.length > 0);
    assert.ok(scheduled.every((s) => !/digest\.(today|tomorrow|escalated)|escalatedBody|dueTodayBody|dueTomorrowBody/.test(s.body)));
    await sync(tasks, { digest: false, overdue: false });
    assert.equal(scheduled.length, 0);
  });

  test('escalation switched off (null) -> no "moved to urgent" notification', async () => {
    await sync([makeTask({ dueDate: d(7) })], { window: null, overdue: false });
    assert.ok(scheduled.every((s) => !s.body.includes('escalated')));
  });

  test('long list: title counts everything, body lists at most 3 titles and ends with an ellipsis', async () => {
    const tasks = Array.from({ length: 6 }, (_, i) => makeTask({ dueDate: d(-1), title: `T${i}` }));
    await sync(tasks);
    assert.equal(scheduled[0].title, 'notifications.overdueTitle|count=6'.replace('overdueTitle', 'digestTitle'));
    assert.ok(scheduled[0].body.endsWith('T0, T1, T2…'));
  });
});

describe('syncReminders: system limits and ordering', () => {
  test('never schedules more than 60 (iOS keeps 64), keeping the earliest', async () => {
    const tasks = Array.from({ length: 100 }, (_, i) => makeTask({ dueDate: d(1 + (i % 30)), remindOffsets: [0], title: `T${i}` }));
    await sync(tasks, { overdue: false, digest: false });
    assert.equal(scheduled.length, 60);
    const times = scheduled.map((s) => s.at.getTime());
    assert.deepEqual(times, [...times].sort((a, b) => a - b));
  });

  test('exactly 60 and 61 candidates: the boundary', async () => {
    const make = (count: number) => Array.from({ length: count }, (_, i) => makeTask({ dueDate: d(1), remindTime: `${String(9 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`, remindOffsets: [0] }));
    await sync(make(60), { overdue: false, digest: false });
    assert.equal(scheduled.length, 60);
    await sync(make(61), { overdue: false, digest: false });
    assert.equal(scheduled.length, 60);
  });

  test('a flood of task alerts can push the morning summary / birthdays out of the 60-slot window (documented limitation)', async () => {
    const flood = Array.from({ length: 70 }, (_, i) => makeTask({ dueDate: d(1), remindTime: '10:00', remindOffsets: [0], title: `F${i}` }));
    const birthday: Birthday = { id: 'b', name: 'Ann', date: '1990-12-24', remindMe: true, remindTime: '09:00', alertDaysBefore: null };
    await sync([...flood, makeTask({ dueDate: d(-1) })], { birthdays: [birthday] });
    assert.equal(scheduled.length, 60);
    assert.ok(!scheduled.some((s) => s.title === 'notifications.birthdayTitle'));
  });

  test('every sync replaces the previous schedule instead of appending to it', async () => {
    const tasks = [makeTask({ dueDate: d(1), remindOffsets: [0] })];
    await sync(tasks, { overdue: false, digest: false });
    await sync(tasks, { overdue: false, digest: false });
    await sync(tasks, { overdue: false, digest: false });
    assert.equal(scheduled.length, 1);
    assert.equal(cancelCalls, 3);
  });

  test('overlapping syncs run one after the other (no interleaving, no doubles)', async () => {
    const tasks = Array.from({ length: 5 }, () => makeTask({ dueDate: d(1), remindOffsets: [0] }));
    await Promise.all([sync(tasks, { overdue: false, digest: false }), sync(tasks, { overdue: false, digest: false }), sync(tasks, { overdue: false, digest: false })]);
    assert.equal(scheduled.length, 5);
    assert.deepEqual(order.filter((x) => x === 'cancel').length, 3);
    // cancel, 5x schedule, cancel, 5x schedule, ...
    assert.deepEqual(order.slice(0, 6), ['cancel', 'schedule', 'schedule', 'schedule', 'schedule', 'schedule']);
  });
});

describe('syncReminders: snoozes', () => {
  test('a snoozed task alerts again at the snooze time; done / deleted / expired snoozes are dropped', async () => {
    const live = makeTask({ title: 'Live' });
    const done = makeTask({ done: true });
    await n.addSnooze(live.id, new Date(2026, 9, 26, 12, 0));
    await n.addSnooze(done.id, new Date(2026, 9, 26, 13, 0));
    await n.addSnooze('deleted', new Date(2026, 9, 26, 14, 0));
    await n.addSnooze(makeTask().id, new Date(2026, 9, 26, 7, 0)); // already in the past
    await sync([live, done], { overdue: false, digest: false });
    assert.deepEqual(scheduled.map((s) => [s.title, hhmm(s.at)]), [['Live', '12:00']]);
    assert.equal(JSON.parse(store.get('reminders:snoozed')!).length, 1, 'stale snoozes are cleaned from storage');
  });
  test('a task has at most one snooze: the newest replaces the older', async () => {
    const task = makeTask();
    await n.addSnooze(task.id, new Date(2026, 9, 26, 12, 0));
    await n.addSnooze(task.id, new Date(2026, 9, 26, 15, 0));
    await sync([task], { overdue: false, digest: false });
    assert.deepEqual(scheduled.map((s) => hhmm(s.at)), ['15:00']);
  });
  test('corrupt snooze storage does not break a sync', async () => {
    store.set('reminders:snoozed', '{oops');
    await assert.doesNotReject(sync([makeTask({ dueDate: d(1), remindOffsets: [0] })], { overdue: false, digest: false }));
    assert.equal(scheduled.length, 1);
  });
});

describe('syncReminders: birthdays', () => {
  const birthday = (date: string, extra: Partial<Birthday> = {}): Birthday => ({ id: date, name: 'Ann', date, remindMe: true, remindTime: '09:00', alertDaysBefore: null, ...extra });
  const run = (b: Birthday) => sync([], { birthdays: [b], overdue: false, digest: false });

  test('later this year vs already passed this year (-> next year)', async () => {
    await run(birthday('1990-12-24'));
    assert.equal(scheduled[0].at.getFullYear(), 2026);
    await run(birthday('1990-03-05'));
    assert.equal(scheduled[0].at.getFullYear(), 2027);
  });
  test('today, time still ahead -> today; time passed -> next year', async () => {
    await run(birthday('1990-10-26', { remindTime: '09:00' }));
    assert.equal(scheduled[0].at.getFullYear(), 2026);
    await run(birthday('1990-10-26', { remindTime: '07:00' }));
    assert.equal(scheduled[0].at.getFullYear(), 2027);
  });
  test('heads-up alert N days earlier; if that moment passed it waits for next year', async () => {
    await run(birthday('1990-11-03', { remindMe: false, alertDaysBefore: 5 }));
    assert.equal(day(scheduled[0].at), '10-29');
    await run(birthday('1990-10-28', { remindMe: false, alertDaysBefore: 5 }));
    assert.equal(scheduled[0].at.getFullYear(), 2027);
  });
  test('remindMe=false and no heads-up -> nothing', async () => {
    await run(birthday('1990-12-24', { remindMe: false }));
    assert.equal(scheduled.length, 0);
  });
  test('Feb 29 birthday never schedules an invalid / past date', async () => {
    await run(birthday('2000-02-29', { alertDaysBefore: 3 }));
    for (const s of scheduled) assert.ok(s.at.getTime() > NOW.getTime() && !Number.isNaN(s.at.getTime()));
  });
  test('legacy birthday without reminder fields keeps the 09:00 reminder', async () => {
    await run({ id: 'x', name: 'Old', date: '1990-12-24' } as Birthday);
    assert.equal(hhmm(scheduled[0].at), '09:00');
  });
});

describe('cancelAllReminders', () => {
  test('cancels everything', async () => {
    await n.cancelAllReminders();
    assert.equal(cancelCalls, 1);
  });
});

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { diffTask, revertPatch } from '@/utils/task-patch';

import { makeTask } from './helpers';

describe('revertPatch', () => {
  const before = makeTask({ title: 'Old', done: false, completedAt: null });

  test('puts back only the fields the refused change set', () => {
    const after = { ...before, title: 'New' };
    // Meanwhile the user also ticked the task off: that must survive the title being refused.
    const current = { ...after, done: true, completedAt: 5 };
    assert.deepEqual(revertPatch(current, before, after, diffTask(before, after)), { ...before, done: true, completedAt: 5 });
  });

  test('a field that changed again since is not touched', () => {
    const after = { ...before, title: 'New' };
    const current = { ...after, title: 'Newer' };
    assert.equal(revertPatch(current, before, after, diffTask(before, after)).title, 'Newer');
  });

  test('reverts a whole multi-field change', () => {
    const after = { ...before, done: true, completedAt: 5 };
    assert.deepEqual(revertPatch(after, before, after, diffTask(before, after)), before);
  });
});

describe('diffTask', () => {
  test('only the changed fields are sent', () => {
    const before = makeTask({ title: 'Old title', done: false });
    assert.deepEqual(diffTask(before, { ...before, done: true, completedAt: 5 }), { done: true, completedAt: 5 });
  });

  test('no change -> empty patch', () => {
    const task = makeTask({ remindOffsets: [0, 15] });
    assert.deepEqual(diffTask(task, { ...task, remindOffsets: [0, 15] }), {});
  });

  test('arrays and nulls are compared by value; id and createdAt are never sent', () => {
    const before = makeTask({ remindOffsets: [0], dueDate: '2026-01-01' });
    const after = { ...before, id: 'other', createdAt: 99, remindOffsets: [0, 60], dueDate: null };
    assert.deepEqual(diffTask(before, after), { remindOffsets: [0, 60], dueDate: null });
  });
});

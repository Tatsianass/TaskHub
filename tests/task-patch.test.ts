import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { diffTask } from '@/utils/task-patch';

import { makeTask } from './helpers';

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

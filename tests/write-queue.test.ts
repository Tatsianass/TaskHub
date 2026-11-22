import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { ApiError } from '@/lib/api-error';
import { createWriteQueue, judge, MAX_SERVER_FAILURES, type QueueEvent, type Write } from '@/lib/write-queue-core';

const write = (id: string, over: Partial<Write> = {}): Write => ({ id, method: 'PATCH', path: `/tasks/${id}`, ...over });

/** A queue over an in-memory "device" and a scripted "server"; `answer` decides how each send ends. */
function setup(answer: (write: Write) => Promise<unknown> | void = () => {}) {
  const disk = new Map<string, Write[]>();
  const sent: string[] = [];
  const events: QueueEvent[] = [];
  const queue = createWriteQueue({
    load: async (userId) => structuredClone(disk.get(userId) ?? []),
    save: async (userId, writes) => void disk.set(userId, structuredClone(writes)),
    send: async (item) => {
      sent.push(item.id);
      return answer(item);
    },
  });
  queue.subscribe((event) => events.push(event));
  return { queue, disk, sent, events };
}

const offline = () => Promise.reject(new ApiError('SERVER_UNREACHABLE', 0));

describe('write queue', () => {
  test('sends writes in the order they were made', async () => {
    const { queue, sent } = setup();
    await queue.enqueue('u', write('a', { method: 'POST' }));
    await queue.enqueue('u', write('b'));
    assert.equal(await queue.flush('u'), 0);
    assert.deepEqual(sent, ['a', 'b']);
  });

  test('offline: writes stay, on the device too, and go out once the server answers', async () => {
    let online = false;
    const { queue, disk, sent } = setup(() => (online ? undefined : offline()));
    await queue.enqueue('u', write('a'));
    await queue.enqueue('u', write('b'));

    assert.equal(await queue.flush('u'), 2);
    assert.deepEqual(sent, ['a'], 'stops at the first unreachable write');
    assert.deepEqual(disk.get('u')?.map((item) => item.id), ['a', 'b']);

    online = true;
    assert.equal(await queue.flush('u'), 0);
    assert.deepEqual(sent, ['a', 'a', 'b']);
    assert.equal(disk.get('u')?.length, 0);
  });

  test('after a restart the saved writes are picked up and sent', async () => {
    const { queue, disk } = setup(() => offline());
    await queue.enqueue('u', write('a'));
    assert.equal(disk.get('u')?.length, 1);

    const sent: string[] = [];
    const restarted = createWriteQueue({
      load: async (userId) => disk.get(userId) ?? [],
      save: async (userId, writes) => void disk.set(userId, writes),
      send: async (item) => void sent.push(item.id),
    });
    assert.equal(await restarted.flush('u'), 0);
    assert.deepEqual(sent, ['a']);
  });

  test('callers flushing at the same time share one run (no double sends)', async () => {
    const { queue, sent } = setup();
    await queue.enqueue('u', write('a'));
    await Promise.all([queue.flush('u'), queue.flush('u'), queue.flush('u')]);
    assert.deepEqual(sent, ['a']);
  });

  test('a write added while flushing is sent by the same run', async () => {
    const { queue, sent } = setup();
    await queue.enqueue('u', write('a'));
    const running = queue.flush('u');
    await queue.enqueue('u', write('b'));
    await running;
    await queue.flush('u');
    assert.deepEqual(sent, ['a', 'b']);
  });

  test('a refused write is dropped and reported with its code; the rest still go out', async () => {
    const { queue, sent, events } = setup((item) => (item.id === 'bad' ? Promise.reject(new ApiError('INVALID_TASK', 400)) : undefined));
    await queue.enqueue('u', write('bad'));
    await queue.enqueue('u', write('good'));
    assert.equal(await queue.flush('u'), 0);
    assert.deepEqual(sent, ['bad', 'good']);
    const settled = events.filter((event) => event.type === 'settled');
    assert.deepEqual(
      settled.map((event) => event.type === 'settled' && [event.write.id, event.outcome, event.code]),
      [
        ['bad', 'rejected', 'INVALID_TASK'],
        ['good', 'done', undefined],
      ],
    );
  });

  test('a server that keeps failing is given up on after a few tries, not retried forever', async () => {
    const { queue, sent, events } = setup(() => Promise.reject(new ApiError('INTERNAL', 500)));
    await queue.enqueue('u', write('a'));
    for (let i = 1; i < MAX_SERVER_FAILURES; i++) assert.equal(await queue.flush('u'), 1);
    assert.equal(await queue.flush('u'), 0);
    assert.equal(sent.length, MAX_SERVER_FAILURES);
    assert.ok(events.some((event) => event.type === 'settled' && event.outcome === 'rejected'));
  });

  test('queues are per user', async () => {
    const { queue, sent } = setup(() => offline());
    await queue.enqueue('a', write('1'));
    assert.equal(queue.size('a'), 1);
    assert.equal(queue.size('b'), 0);
    await queue.flush('b');
    assert.deepEqual(sent, []);
  });

  test('size events follow the backlog', async () => {
    const { queue, events } = setup();
    await queue.enqueue('u', write('a'));
    await queue.flush('u');
    const sizes = events.flatMap((event) => (event.type === 'size' ? [event.size] : []));
    assert.deepEqual(sizes, [0, 1, 0]);
  });

  test('reset drops what is held in memory and stops a run in progress', async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { queue, sent } = setup(() => gate);
    await queue.enqueue('u', write('a'));
    await queue.enqueue('u', write('b'));
    const running = queue.flush('u');
    while (sent.length === 0) await new Promise((resolve) => setImmediate(resolve));
    queue.reset();
    release();
    await running;
    assert.deepEqual(sent, ['a']);
    assert.equal(queue.size('u'), 0);
  });
});

describe('judge', () => {
  const cases: [string, Write['method'], unknown, string][] = [
    ['no connection', 'PATCH', new ApiError('SERVER_UNREACHABLE', 0), 'wait'],
    ['session problem', 'PATCH', new ApiError('SESSION_EXPIRED', 401), 'wait'],
    ['rate limit', 'POST', new ApiError('TOO_MANY_REQUESTS', 429), 'wait'],
    ['server error', 'PATCH', new ApiError('INTERNAL', 500), 'server-failed'],
    ['create already there', 'POST', new ApiError('DUPLICATE_ID', 409), 'done'],
    ['delete already gone', 'DELETE', new ApiError('NOT_FOUND', 404), 'done'],
    ['change to a deleted task', 'PATCH', new ApiError('NOT_FOUND', 404), 'rejected'],
    ['invalid data', 'POST', new ApiError('INVALID_TASK', 400), 'rejected'],
    ['not an ApiError', 'PATCH', new Error('boom'), 'wait'],
  ];
  for (const [name, method, error, verdict] of cases) {
    test(`${name} -> ${verdict}`, () => assert.equal(judge(write('x', { method }), error).verdict, verdict));
  }
});

import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';

import { createApp } from '../src/app.js';
import { createTestDb } from './helpers.js';

describe('createApp', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>;
  let server: Server;
  let baseUrl: string;

  before(async () => {
    testDb = await createTestDb();
    server = createApp(testDb.pool, { corsOrigins: ['http://localhost:8081'] }).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await testDb.drop();
  });

  test('GET /health', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });

  test('GET /health -> 503 when the database is unreachable', async () => {
    const broken = await createTestDb();
    const app = createApp(broken.pool);
    const srv = app.listen(0);
    await new Promise((resolve) => srv.once('listening', resolve));
    try {
      await broken.pool.end();
      const res = await fetch(`http://localhost:${(srv.address() as AddressInfo).port}/health`);
      assert.equal(res.status, 503);
      assert.deepEqual(await res.json(), { ok: false });
    } finally {
      await new Promise((resolve) => srv.close(resolve));
    }
  });

  test('CORS allows the configured origin only', async () => {
    const allowed = await fetch(`${baseUrl}/health`, {
      headers: { Origin: 'http://localhost:8081' },
    });
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:8081');

    const other = await fetch(`${baseUrl}/health`, {
      headers: { Origin: 'http://evil.example' },
    });
    assert.equal(other.headers.get('access-control-allow-origin'), null);
  });

  test('CORS preflight allows Authorization header', async () => {
    const res = await fetch(`${baseUrl}/tasks`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:8081',
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });
    assert.equal(res.status, 204);
    assert.match(res.headers.get('access-control-allow-headers') ?? '', /authorization/i);
  });

  test('unknown route -> 404 NOT_FOUND', async () => {
    const res = await fetch(`${baseUrl}/nope`);
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'NOT_FOUND' });
  });

  test('malformed JSON -> 400 INVALID_JSON', async () => {
    const res = await fetch(`${baseUrl}/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"password": "secret"',
    });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: 'INVALID_JSON' });
  });

  test('body over 1 MB -> 413 PAYLOAD_TOO_LARGE', async () => {
    const res = await fetch(`${baseUrl}/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: 'x'.repeat(1024 * 1024) }),
    });
    assert.equal(res.status, 413);
    assert.deepEqual(await res.json(), { error: 'PAYLOAD_TOO_LARGE' });
  });
});

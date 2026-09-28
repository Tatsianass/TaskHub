import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';

import express from 'express';

import { ApiError, errorHandler, notFoundHandler } from '../src/errors.js';

describe('error middleware', () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    const app = express();
    app.use(express.json({ limit: '1kb' }));
    app.post('/echo', (req, res) => {
      res.json(req.body);
    });
    app.get('/api-error', () => {
      throw new ApiError(409, 'EMAIL_TAKEN');
    });
    app.get('/async-api-error', async () => {
      await Promise.resolve();
      throw new ApiError(401, 'SESSION_EXPIRED');
    });
    app.post('/crash', () => {
      throw new Error('boom');
    });
    app.use(notFoundHandler);
    app.use(errorHandler);
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  test('ApiError -> its status and { error: code }', async () => {
    const res = await fetch(`${baseUrl}/api-error`);
    assert.equal(res.status, 409);
    assert.deepEqual(await res.json(), { error: 'EMAIL_TAKEN' });
  });

  test('ApiError thrown from an async handler is caught (express 5)', async () => {
    const res = await fetch(`${baseUrl}/async-api-error`);
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: 'SESSION_EXPIRED' });
  });

  test('unknown route -> 404 NOT_FOUND', async () => {
    const res = await fetch(`${baseUrl}/missing`);
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'NOT_FOUND' });
  });

  test('unexpected error -> 500 INTERNAL; stack logged, body never logged', async (t) => {
    const logged = t.mock.method(console, 'error', () => {});
    const res = await fetch(`${baseUrl}/crash`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'hunter2-secret' }),
    });
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: 'INTERNAL' });
    assert.equal(logged.mock.callCount(), 1);
    const output = logged.mock.calls[0].arguments.join(' ');
    assert.match(output, /boom/);
    assert.doesNotMatch(output, /hunter2-secret/);
  });

  test('malformed JSON -> 400 INVALID_JSON', async () => {
    const res = await fetch(`${baseUrl}/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"a":',
    });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: 'INVALID_JSON' });
  });

  test('oversized body -> 413 PAYLOAD_TOO_LARGE', async () => {
    const res = await fetch(`${baseUrl}/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: 'x'.repeat(2048) }),
    });
    assert.equal(res.status, 413);
    assert.deepEqual(await res.json(), { error: 'PAYLOAD_TOO_LARGE' });
  });

  test('valid JSON passes through', async () => {
    const res = await fetch(`${baseUrl}/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a: 1 }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { a: 1 });
  });
});

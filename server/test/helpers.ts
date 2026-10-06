import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { DatabaseSync } from 'node:sqlite';

import { createApp } from '../src/app.js';

export type TestResponse = { status: number; body: any };

/** A JSON `request(method, path, { body, token })` against `baseUrl`. */
export function requester(baseUrl: string) {
  return async function request(
    method: string,
    path: string,
    { body, token }: { body?: unknown; token?: string } = {},
  ): Promise<TestResponse> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : undefined };
  };
}

/** Serves `createApp(db)` on an ephemeral port. */
export async function startApp(db: DatabaseSync) {
  const server = createApp(db).listen(0);
  await once(server, 'listening');
  const baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
  const request = requester(baseUrl);

  async function close() {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }

  return { baseUrl, request, close };
}

export type TestApp = Awaited<ReturnType<typeof startApp>>;

export const TEST_PASSWORD = 's3cret-pass';

let userCounter = 0;

/** Registers a fresh user and returns `{ token, user }`. */
export async function registerUser(app: Pick<TestApp, 'request'>, email?: string) {
  userCounter += 1;
  const res = await app.request('POST', '/auth/register', {
    body: { email: email ?? `fixture${userCounter}-${Date.now()}@example.com`, password: TEST_PASSWORD },
  });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { token: string; user: { id: string; email: string } };
}

let idCounter = 0;

/** A unique id in the app's format (`<ms>-<random>`). */
export function newClientId() {
  idCounter += 1;
  return `${Date.now()}-t${idCounter}`;
}

export function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: newClientId(),
    title: 'Task',
    description: '',
    quadrantId: 'urgent-important',
    tag: null,
    done: false,
    completedAt: null,
    createdAt: Date.now(),
    dueDate: null,
    remindMe: false,
    remindTime: null,
    ...overrides,
  };
}

export function makeBirthday(overrides: Record<string, unknown> = {}) {
  return { id: newClientId(), name: 'Ann', date: '1990-02-28', remindMe: true, remindTime: '09:00', alertDaysBefore: null, ...overrides };
}

import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { DatabaseSync } from 'node:sqlite';

import { createApp } from '../src/app.js';

export type TestResponse = { status: number; body: any };

/** Serves `createApp(db)` on an ephemeral port. */
export async function startApp(db: DatabaseSync) {
  const server = createApp(db).listen(0);
  await once(server, 'listening');
  const baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;

  async function request(
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
  }

  async function close() {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }

  return { baseUrl, request, close };
}

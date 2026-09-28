import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';

import { SERVER_DIR } from '../src/config.js';
import { closeDatabase, openDatabase } from '../src/db/connection.js';
import {
  TEST_PASSWORD,
  makeBirthday,
  makeTask,
  registerUser,
  requester,
  startApp,
} from './helpers.js';

// The key acceptance test: data survives close/reopen, a crash (SIGKILL) and
// a graceful shutdown (SIGTERM), because it lives in the DB file (R3).

const tmpRoot = mkdtempSync(join(tmpdir(), 'todo-durability-'));
const children = new Set<ChildProcess>();

after(() => {
  for (const child of children) child.kill('SIGKILL');
  rmSync(tmpRoot, { recursive: true, force: true });
});

function walSize(dbPath: string) {
  const wal = `${dbPath}-wal`;
  return existsSync(wal) ? statSync(wal).size : 0;
}

type Exit = { code: number | null; signal: NodeJS.Signals | null };

/**
 * Runs the real entry point (`src/index.ts`) as a child process on `dbPath`
 * with `PORT=0`, and resolves once it logs its port and `/health` answers.
 */
async function startServerProcess(dbPath: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, DB_PATH: dbPath, PORT: '0' };
  delete env.NODE_TEST_CONTEXT; // the child is a plain server, not a test file
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: SERVER_DIR,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.add(child);

  let output = '';
  const exited = new Promise<Exit>((resolve) => {
    child.once('exit', (code, signal) => {
      children.delete(child);
      resolve({ code, signal });
    });
  });

  const port = await new Promise<number>((resolve, reject) => {
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      const match = /listening on http:\/\/localhost:(\d+)/.exec(output);
      if (match) resolve(Number(match[1]));
    };
    child.stdout!.on('data', onData);
    child.stderr!.on('data', onData);
    exited.then(({ code, signal }) =>
      reject(new Error(`server exited before listening (code ${code}, ${signal}):\n${output}`)),
    );
  });

  const baseUrl = `http://localhost:${port}`;
  const health = await fetch(`${baseUrl}/health`);
  assert.deepEqual(await health.json(), { ok: true });

  return {
    request: requester(baseUrl),
    exited,
    output: () => output,
    kill: (signal: NodeJS.Signals) => child.kill(signal),
  };
}

type Api = { request: ReturnType<typeof requester> };

/** Registers a user and creates a task + birthday; returns what to look for later. */
async function seed(api: Api) {
  const { token, user } = await registerUser(api);
  const task = makeTask({ title: 'survives restarts' });
  const birthday = makeBirthday({ name: 'Durable Dora' });
  assert.equal((await api.request('POST', '/tasks', { token, body: task })).status, 201);
  assert.equal((await api.request('POST', '/birthdays', { token, body: birthday })).status, 201);
  return { email: user.email, task, birthday };
}

/** Logs in with the same password on a fresh process/app and finds the data. */
async function assertSeedPresent(api: Api, { email, task, birthday }: Awaited<ReturnType<typeof seed>>) {
  const login = await api.request('POST', '/auth/login', { body: { email, password: TEST_PASSWORD } });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  const { token } = login.body;
  assert.deepEqual((await api.request('GET', '/tasks', { token })).body, [task]);
  assert.deepEqual((await api.request('GET', '/birthdays', { token })).body, [birthday]);
}

describe('durability', { timeout: 60_000 }, () => {
  test('in-process: close the DB, reopen the same file with a new app (R3.2)', async () => {
    const dbPath = join(tmpRoot, 'in-process', 'app.db');

    const db1 = openDatabase(dbPath);
    const app1 = await startApp(db1);
    const seeded = await seed(app1);
    await app1.close();
    closeDatabase(db1);

    const db2 = openDatabase(dbPath);
    const app2 = await startApp(db2);
    try {
      await assertSeedPresent(app2, seeded);
    } finally {
      await app2.close();
      closeDatabase(db2);
    }
  });

  test('crash: SIGKILL the server, restart on the same file, data is there (R3.5, R3.8)', async () => {
    const dbPath = join(tmpRoot, 'sigkill', 'app.db');

    const first = await startServerProcess(dbPath);
    const seeded = await seed(first);
    first.kill('SIGKILL');
    assert.deepEqual(await first.exited, { code: null, signal: 'SIGKILL' });
    // No checkpoint ran: the committed writes exist only in the WAL, so the
    // restart below really exercises crash recovery.
    assert.ok(walSize(dbPath) > 0, 'expected un-checkpointed data in the -wal file');

    const second = await startServerProcess(dbPath);
    try {
      await assertSeedPresent(second, seeded);
    } finally {
      second.kill('SIGTERM');
      await second.exited;
    }
  });

  test('graceful: SIGTERM exits 0 and checkpoints the WAL; restart finds the data (R3.6)', async () => {
    const dbPath = join(tmpRoot, 'sigterm', 'app.db');

    const first = await startServerProcess(dbPath);
    const seeded = await seed(first);
    first.kill('SIGTERM');
    assert.deepEqual(await first.exited, { code: 0, signal: null }, first.output());
    assert.match(first.output(), /SIGTERM received/);
    assert.equal(walSize(dbPath), 0, 'the -wal file should be empty or absent after shutdown');

    const second = await startServerProcess(dbPath);
    try {
      await assertSeedPresent(second, seeded);
    } finally {
      second.kill('SIGTERM');
      assert.equal((await second.exited).code, 0);
    }
  });
});

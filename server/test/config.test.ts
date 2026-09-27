import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, test } from 'node:test';

import { SERVER_DIR, loadConfig, loadEnvFile } from '../src/config.js';

describe('config', () => {
  test('SERVER_DIR is the server/ package directory', () => {
    assert.equal(SERVER_DIR, resolve(import.meta.dirname, '..'));
  });

  test('defaults', () => {
    assert.deepEqual(loadConfig({}), {
      port: 4000,
      dbPath: join(SERVER_DIR, 'data', 'app.db'),
      corsOrigins: ['http://localhost:8081'],
    });
  });

  test('blank values fall back to defaults', () => {
    const config = loadConfig({ PORT: ' ', DB_PATH: '', CORS_ORIGIN: ' , ' });
    assert.equal(config.port, 4000);
    assert.equal(config.dbPath, join(SERVER_DIR, 'data', 'app.db'));
    assert.deepEqual(config.corsOrigins, ['http://localhost:8081']);
  });

  test('overrides', () => {
    const config = loadConfig({
      PORT: '5123',
      DB_PATH: '/var/lib/todo/app.db',
      CORS_ORIGIN: 'http://localhost:8081, http://192.168.1.10:8081',
    });
    assert.equal(config.port, 5123);
    assert.equal(config.dbPath, '/var/lib/todo/app.db');
    assert.deepEqual(config.corsOrigins, [
      'http://localhost:8081',
      'http://192.168.1.10:8081',
    ]);
  });

  test('relative DB_PATH resolves against server/, not cwd', () => {
    const config = loadConfig({ DB_PATH: './other/test.db' });
    assert.equal(config.dbPath, join(SERVER_DIR, 'other', 'test.db'));
  });

  test('PORT 0 (ephemeral) is allowed', () => {
    assert.equal(loadConfig({ PORT: '0' }).port, 0);
  });

  for (const bad of ['abc', '-1', '65536', '40.5']) {
    test(`invalid PORT "${bad}" throws`, () => {
      assert.throws(() => loadConfig({ PORT: bad }), /Invalid PORT/);
    });
  }

  test('loadEnvFile reads a file without overriding existing env', () => {
    const dir = mkdtempSync(join(tmpdir(), 'todo-config-'));
    const file = join(dir, '.env');
    writeFileSync(file, 'TODO_TEST_A=from-file\nTODO_TEST_B=from-file\n');
    process.env.TODO_TEST_B = 'from-env';
    try {
      loadEnvFile(file);
      assert.equal(process.env.TODO_TEST_A, 'from-file');
      assert.equal(process.env.TODO_TEST_B, 'from-env');
    } finally {
      delete process.env.TODO_TEST_A;
      delete process.env.TODO_TEST_B;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('loadEnvFile ignores a missing file', () => {
    assert.doesNotThrow(() => loadEnvFile(join(tmpdir(), 'does-not-exist.env')));
  });
});

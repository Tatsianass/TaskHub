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

  const DB = 'postgres://todo:todo@localhost:5432/todo';

  test('defaults', () => {
    assert.deepEqual(loadConfig({ DATABASE_URL: DB }), {
      port: 4000,
      host: '0.0.0.0',
      databaseUrl: DB,
      pgPoolMax: 10,
      pgSsl: false,
      corsOrigins: ['http://localhost:8081'],
      trustProxy: 0,
      appleAudiences: ['com.tatsianas.todomobile'],
    });
  });

  test('blank values fall back to defaults', () => {
    const config = loadConfig({ DATABASE_URL: DB, PORT: ' ', HOST: ' ', PG_POOL_MAX: '', CORS_ORIGIN: ' , ' });
    assert.equal(config.port, 4000);
    assert.equal(config.host, '0.0.0.0');
    assert.equal(config.pgPoolMax, 10);
    assert.deepEqual(config.corsOrigins, ['http://localhost:8081']);
  });

  test('overrides', () => {
    const config = loadConfig({
      DATABASE_URL: DB,
      PORT: '5123',
      PG_POOL_MAX: '25',
      CORS_ORIGIN: 'http://localhost:8081, http://192.168.1.10:8081',
    });
    assert.equal(config.port, 5123);
    assert.equal(config.pgPoolMax, 25);
    assert.deepEqual(config.corsOrigins, [
      'http://localhost:8081',
      'http://192.168.1.10:8081',
    ]);
  });

  test('HOST override is trimmed', () => {
    assert.equal(loadConfig({ DATABASE_URL: DB, HOST: ' 127.0.0.1 ' }).host, '127.0.0.1');
  });

  test('DATABASE_URL is required', () => {
    assert.throws(() => loadConfig({}), /DATABASE_URL is required/);
    assert.throws(() => loadConfig({ DATABASE_URL: '  ' }), /DATABASE_URL is required/);
  });

  test('an invalid DATABASE_URL throws without echoing the URL or password (R3.6)', () => {
    for (const bad of ['not a url with s3cret', 'mysql://u:s3cret@h/db']) {
      assert.throws(
        () => loadConfig({ DATABASE_URL: bad }),
        (error: Error) => /DATABASE_URL/.test(error.message) && !error.message.includes('s3cret'),
      );
    }
  });

  test('TLS: plaintext outside production, verified in production, sslmode overrides (R3.3)', () => {
    assert.equal(loadConfig({ DATABASE_URL: DB }).pgSsl, false);
    assert.deepEqual(loadConfig({ DATABASE_URL: DB, NODE_ENV: 'production' }).pgSsl, { rejectUnauthorized: true });
    const off = loadConfig({ DATABASE_URL: `${DB}?sslmode=disable`, NODE_ENV: 'production' });
    assert.equal(off.pgSsl, false);
    const loose = loadConfig({ DATABASE_URL: `${DB}?sslmode=no-verify`, NODE_ENV: 'production' });
    assert.deepEqual(loose.pgSsl, { rejectUnauthorized: false });
    // sslmode is consumed here so the pg driver can't override our explicit ssl option.
    assert.equal(off.databaseUrl.includes('sslmode'), false);
  });

  for (const bad of ['0', 'abc', '101']) {
    test(`invalid PG_POOL_MAX "${bad}" throws`, () => {
      assert.throws(() => loadConfig({ DATABASE_URL: DB, PG_POOL_MAX: bad }), /Invalid PG_POOL_MAX/);
    });
  }

  test('PORT 0 (ephemeral) is allowed', () => {
    assert.equal(loadConfig({ DATABASE_URL: DB, PORT: '0' }).port, 0);
  });

  for (const bad of ['abc', '-1', '65536', '40.5']) {
    test(`invalid PORT "${bad}" throws`, () => {
      assert.throws(() => loadConfig({ DATABASE_URL: DB, PORT: bad }), /Invalid PORT/);
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

describe('TRUST_PROXY', () => {
  const DB = 'postgres://todo:todo@localhost:5432/todo';
  test('defaults to 0, parses hop counts, rejects junk', () => {
    assert.equal(loadConfig({ DATABASE_URL: DB }).trustProxy, 0);
    assert.equal(loadConfig({ DATABASE_URL: DB, TRUST_PROXY: '1' }).trustProxy, 1);
    assert.deepEqual(loadConfig({ DATABASE_URL: DB, APPLE_BUNDLE_IDS: ' a.b , host.exp.Exponent ' }).appleAudiences, ['a.b', 'host.exp.Exponent']);
    assert.throws(() => loadConfig({ DATABASE_URL: DB, TRUST_PROXY: 'yes' }), /Invalid TRUST_PROXY/);
  });
});

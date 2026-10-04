import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { after, describe, test } from 'node:test';

import { closeDatabase, openDatabase } from '../src/db/connection.js';
import { MIGRATIONS, getUserVersion, runMigrations } from '../src/db/migrations.js';

const tmpRoot = mkdtempSync(join(tmpdir(), 'todo-db-'));
after(() => rmSync(tmpRoot, { recursive: true, force: true }));

let counter = 0;
/** A fresh, not-yet-existing DB path inside a not-yet-existing directory. */
function freshPath() {
  counter += 1;
  return join(tmpRoot, `case-${counter}`, 'nested', 'app.db');
}

function pragma(db: DatabaseSync, name: string) {
  const row = db.prepare(`PRAGMA ${name}`).get() as Record<string, unknown>;
  return row[name];
}

function tableNames(db: DatabaseSync) {
  return (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as { name: string }[]
  ).map((row) => row.name);
}

function insertUser(db: DatabaseSync, id: string, email: string) {
  db.prepare(
    `INSERT INTO users (id, email, password_hash, password_salt, password_params, created_at)
     VALUES (?, ?, 'h', 's', '{}', ?)`,
  ).run(id, email, Date.now());
}

describe('openDatabase', () => {
  test('creates a missing file and directory and applies schema v1 (R3.3)', () => {
    const path = freshPath();
    assert.equal(existsSync(path), false);

    const db = openDatabase(path);
    try {
      assert.equal(existsSync(path), true);
      assert.equal(getUserVersion(db), MIGRATIONS.length);
            assert.deepEqual(tableNames(db), ['birthdays', 'sessions', 'tasks', 'users']);
    } finally {
      closeDatabase(db);
    }
  });

  test('sets durability pragmas (R3.5)', () => {
    const db = openDatabase(freshPath());
    try {
      assert.equal(pragma(db, 'journal_mode'), 'wal');
      assert.equal(pragma(db, 'foreign_keys'), 1);
      assert.equal(pragma(db, 'synchronous'), 2); // FULL
      const timeout = db.prepare('PRAGMA busy_timeout').get() as Record<string, unknown>;
      assert.equal(Object.values(timeout)[0], 5000);
    } finally {
      closeDatabase(db);
    }
  });

  test('re-opening an existing file keeps data and schema version (R3.2, R3.4)', () => {
    const path = freshPath();
    const first = openDatabase(path);
    insertUser(first, 'u1', 'a@example.com');
    closeDatabase(first);

    const second = openDatabase(path);
    try {
      assert.equal(getUserVersion(second), MIGRATIONS.length);
      const row = second.prepare('SELECT id, email FROM users').get();
      assert.deepEqual({ ...row }, { id: 'u1', email: 'a@example.com' });
    } finally {
      closeDatabase(second);
    }
  });

  test('closeDatabase checkpoints the WAL and is safe to call twice', () => {
    const path = freshPath();
    const db = openDatabase(path);
    insertUser(db, 'u1', 'a@example.com');
    closeDatabase(db);
    assert.equal(db.isOpen, false);
    assert.equal(existsSync(`${path}-wal`) ? statSync(`${path}-wal`).size : 0, 0);
    assert.doesNotThrow(() => closeDatabase(db));
  });

  test('schema constraints: unique case-insensitive email, FK cascade', () => {
    const db = openDatabase(freshPath());
    try {
      insertUser(db, 'u1', 'a@example.com');
      assert.throws(
        () => insertUser(db, 'u2', 'A@Example.com'),
        (error: { errcode?: number }) => error.errcode === 2067, // SQLITE_CONSTRAINT_UNIQUE
      );
      assert.throws(
        () =>
          db.prepare(
            `INSERT INTO birthdays (id, user_id, name, date) VALUES ('b1', 'nobody', 'X', '2000-01-01')`,
          ).run(),
        /FOREIGN KEY constraint failed/,
      );
      db.prepare(
        `INSERT INTO birthdays (id, user_id, name, date) VALUES ('b1', 'u1', 'X', '2000-01-01')`,
      ).run();
      db.prepare(`DELETE FROM users WHERE id = 'u1'`).run();
      const count = db.prepare('SELECT count(*) AS n FROM birthdays').get() as { n: number };
      assert.equal(count.n, 0);
    } finally {
      closeDatabase(db);
    }
  });
});

describe('runMigrations', () => {
  test('running twice is a no-op', () => {
    const path = freshPath();
    const db = openDatabase(path);
    try {
      insertUser(db, 'u1', 'a@example.com');
      runMigrations(db);
      runMigrations(db);
      assert.equal(getUserVersion(db), MIGRATIONS.length);
      assert.deepEqual(tableNames(db), ['birthdays', 'sessions', 'tasks', 'users']);
      const count = db.prepare('SELECT count(*) AS n FROM users').get() as { n: number };
      assert.equal(count.n, 1);
    } finally {
      closeDatabase(db);
    }
  });

  test('applies only pending migrations', () => {
    const db = openDatabase(freshPath());
    try {
      runMigrations(db, [...MIGRATIONS, 'CREATE TABLE extra (id TEXT PRIMARY KEY);']);
      assert.equal(getUserVersion(db), MIGRATIONS.length + 1);
      assert.ok(tableNames(db).includes('extra'));
    } finally {
      closeDatabase(db);
    }
  });

  test('a failing migration rolls back and leaves user_version unchanged', () => {
    const db = openDatabase(freshPath());
    try {
      assert.throws(() =>
        runMigrations(db, [
          ...MIGRATIONS,
          'CREATE TABLE half_done (id TEXT); SELECT * FROM no_such_table;',
        ]),
      );
      assert.equal(db.isTransaction, false);
      assert.equal(getUserVersion(db), MIGRATIONS.length);
      assert.equal(tableNames(db).includes('half_done'), false);
    } finally {
      closeDatabase(db);
    }
  });

  test('refuses a DB newer than the code', () => {
    const path = freshPath();
    const db = openDatabase(path);
    db.exec('PRAGMA user_version = 99');
    closeDatabase(db);
    assert.throws(() => openDatabase(path), /newer than this server supports/);
  });
});

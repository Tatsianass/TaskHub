import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';

import { createPool } from '../src/db/connection.js';
import { getSchemaVersion, MIGRATIONS } from '../src/db/migrations.js';
import { usersRepo } from '../src/repos/users.js';
import { createTestDb, makeTask } from './helpers.js';
import { tasksRepo } from '../src/repos/tasks.js';

const dbs: Awaited<ReturnType<typeof createTestDb>>[] = [];
after(async () => {
  await Promise.all(dbs.map((db) => db.drop()));
});

describe('durability', () => {
  test('committed data survives closing the pool and reconnecting (R1.2)', async () => {
    const first = await createTestDb();
    dbs.push(first);
    const user = await usersRepo(first.pool).create('keep@example.com', {
      hash: 'h',
      salt: 's',
      params: { N: 16384, r: 8, p: 1, keylen: 64 },
    });
    const task = makeTask({ title: 'still here' });
    await tasksRepo(first.pool).create(user.id, task);

    // A brand-new pool on the same schema: what the server does after a restart.
    await first.pool.end();
    const reopened = createPool({ url: first.url, searchPath: first.schema });
    try {
      assert.equal(await getSchemaVersion(reopened), MIGRATIONS.length);
      assert.equal((await usersRepo(reopened).findByEmail('keep@example.com'))?.id, user.id);
      assert.deepEqual(await tasksRepo(reopened).list(user.id), [task]);
    } finally {
      await reopened.end();
    }
    // `first.drop()` ends the (already ended) pool again; pg tolerates that only once, so
    // drop through a fresh admin connection instead.
    dbs.pop();
    const admin = createPool({ url: first.url, max: 1 });
    await admin.query(`DROP SCHEMA ${first.schema} CASCADE`);
    await admin.end();
  });
});

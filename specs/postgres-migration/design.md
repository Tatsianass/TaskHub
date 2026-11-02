# Design — PostgreSQL migration

Implements: [requirements.md](requirements.md).

## 1. Architecture

```
Expo app ──HTTP (unchanged)──▶ Express API (server/) ──pg Pool──▶ PostgreSQL
                                   │
                                   └─ one-off: scripts/sqlite-to-postgres.ts reads app.db (read-only)
```

Only the box on the right of the API changes. `src/lib/api.ts` and every screen stay as they are.

## 2. Key technical consequence: sync → async

`node:sqlite` is synchronous; `pg` is asynchronous. So **every repo method, every route handler that
touches the DB, `requireAuth`, `runMigrations`, `openDatabase`, `closeDatabase` and the tests become
`async`**. Express 5 forwards rejected promises from handlers/middleware to the error handler, so no
wrapper is needed. This is the bulk of the work; the SQL itself is nearly the same.

## 3. Technology choices

| Choice | Decision | Why |
|--------|----------|-----|
| Driver | `pg` (node-postgres) + `@types/pg` | Pure JS, no native build, mature, tiny. |
| ORM / query builder | None | Repos are small; keeps the diff reviewable. |
| Migrations | Own runner (as today) using a `schema_migrations` table | No new dependency; same append-only idea. |
| IDs | Stay `TEXT` | Task/birthday ids are client-generated (`<ms>-<rand>`), not UUIDs. |
| Tests | Real PG (docker compose locally, service container in CI), one **schema per test file** | Faithful to production; fast enough; no mocks. |

## 4. Configuration (`config.ts`)

New fields: `databaseUrl` (required), `pgPoolMax` (default 10), `pgSsl` (derived).
Removed: `dbPath`, `DB_PATH`, `DEFAULT_DB_PATH`.

```
DATABASE_URL=postgres://todo:todo@localhost:5432/todo   # server/.env.example
PG_POOL_MAX=10
```

TLS: in production default to `ssl: { rejectUnauthorized: true }`; `sslmode=disable` in the URL turns it
off, `sslmode=no-verify` sets `rejectUnauthorized: false` (some managed providers) — documented in
`.env.example`. `DATABASE_URL` is never logged (log host + db name only).

## 5. Connection layer (`db/`)

```ts
// db/connection.ts
export type Db = Pool;                         // app-wide handle
export type Queryable = Pick<Pool | PoolClient, 'query'>;

export async function openDatabase(url, opts): Promise<Pool>  // new Pool, SELECT 1, runMigrations
export async function closeDatabase(pool): Promise<void>      // pool.end()

// db/transaction.ts
export async function withTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T>
//  client = await pool.connect(); BEGIN; try { fn; COMMIT } catch { ROLLBACK; throw } finally { client.release() }
```

- `types.setTypeParser(20, Number)` (BIGINT → number). Safe: epoch ms ≈ 1.8·10¹², far below 2⁵³. (R1.3)
- Pool `error` event handler logs and does not crash the process.
- `statement_timeout` = 10 s and `idle_in_transaction_session_timeout` = 15 s via pool options.

## 6. Schema (baseline migration `001_init`)

PG is fresh and data arrives through the Copy script, so the six SQLite migrations are **squashed into
one baseline** reflecting the final schema. Later changes are new numbered migrations.

```sql
CREATE TABLE users (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL,
  password_hash   TEXT NOT NULL,
  password_salt   TEXT NOT NULL,
  password_params JSONB NOT NULL,                       -- was TEXT holding JSON
  created_at      BIGINT NOT NULL,
  apple_sub       TEXT
);
CREATE UNIQUE INDEX users_email_key     ON users (lower(email));               -- was COLLATE NOCASE
CREATE UNIQUE INDEX users_apple_sub_key ON users (apple_sub) WHERE apple_sub IS NOT NULL;

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE INDEX sessions_user_idx    ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);   -- deleteExpired

CREATE TABLE tasks (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seq            BIGINT GENERATED ALWAYS AS IDENTITY,        -- replaces SQLite rowid tie-break
  title          TEXT NOT NULL CHECK (length(btrim(title)) > 0),
  description    TEXT NOT NULL DEFAULT '',
  quadrant_id    TEXT NOT NULL CHECK (quadrant_id IN
                   ('urgent-important','not-urgent-important','urgent-not-important','not-urgent-not-important')),
  tag            TEXT CHECK (tag IS NULL OR tag IN ('work','home')),
  done           BOOLEAN NOT NULL DEFAULT false,
  completed_at   BIGINT,
  created_at     BIGINT NOT NULL,
  due_date       TEXT,
  remind_me      BOOLEAN NOT NULL DEFAULT false,
  remind_time    TEXT,
  remind_offsets JSONB NOT NULL DEFAULT '[]'                 -- array of numbers, ≤ 5
);
CREATE INDEX tasks_user_created_idx ON tasks (user_id, created_at DESC, seq DESC);

CREATE TABLE birthdays (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seq               BIGINT GENERATED ALWAYS AS IDENTITY,
  name              TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  date              TEXT NOT NULL,
  remind_me         BOOLEAN NOT NULL DEFAULT true,
  remind_time       TEXT DEFAULT '09:00',
  alert_days_before INTEGER CHECK (alert_days_before IS NULL OR alert_days_before BETWEEN 1 AND 60)
);
CREATE INDEX birthdays_user_idx ON birthdays (user_id, seq);
```

Notes
- `due_date`, `date`, `remind_time` stay `TEXT` (the app sends `YYYY-MM-DD` / `HH:mm` strings; no tz
  semantics to preserve). Converting to `DATE`/`TIME` is deliberately deferred.
- `done`/`remind_me` become real booleans → mappers drop the `=== 1` / `? 1 : 0` conversions.
- `seq` uses `GENERATED ALWAYS`, so the Copy script inserts with `OVERRIDING SYSTEM VALUE` and then
  `setval`s the sequence to `max(seq)`.
- PG `btrim` trims only spaces while SQLite `trim` did the same; `validation.ts` already trims in JS,
  so behaviour is identical.

### 6.1 Migration runner (`db/migrations.ts`)

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (version INT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
```
1. Take `pg_advisory_lock(727274)` on a dedicated client (R2.2: two Machines booting together).
2. Read `max(version)`; if greater than `MIGRATIONS.length` → throw (R2.5).
3. For each pending migration: `BEGIN; <sql>; INSERT INTO schema_migrations; COMMIT` (R2.4).
4. Release the lock in `finally`.

`MIGRATIONS` stays an append-only array of SQL strings; index 0 = `001_init`.

## 7. Code changes by file

| File | Change |
|------|--------|
| `db/connection.ts` | Pool-based `openDatabase` / `closeDatabase` (§5). Remove PRAGMAs, mkdir. |
| `db/migrations.ts` | PG runner (§6.1), baseline SQL (§6). |
| `db/transaction.ts` | Async `withTransaction` yielding a `PoolClient`. |
| `repos/*.ts` | Factory takes `Queryable`; `?` → `$1…$n`; `prepare().get/all/run` → `await db.query()`; use `rows`, `rowCount`; `INSERT … ON CONFLICT (id) DO NOTHING` unchanged; `UPDATE … RETURNING` unchanged; order by `created_at DESC, seq DESC`. Methods return `Promise<…>`. |
| `repos/sessions.ts` | `findValid` etc. async; `deleteExpired` uses `rowCount`. |
| `repos/import-ids.ts` | `importRow` takes async callbacks. |
| `auth/middleware.ts` | `requireAuth` becomes `async`. |
| `routes/*.ts` | `await` repo calls. `/import` runs `withTransaction(pool, async (client) => { const t = tasksRepo(client); const b = birthdaysRepo(client); … })`. |
| `errors.ts` | Replace SQLite constants with `PG_UNIQUE_VIOLATION='23505'`, `PG_CHECK_VIOLATION='23514'`; `isPgError(error, code, constraint?)` reads `error.code` / `error.constraint`. |
| `app.ts` | Takes `Pool`; `/health` does `SELECT 1` (R3.5). |
| `index.ts` | `await openDatabase`; shutdown: `server.close` → `await closeDatabase`. Drop the expired-session sweep into a call after open + an hourly `setInterval(...).unref()`. |
| `config.ts` | §4. |

### 7.1 Error mapping gotchas
- SQLite had separate codes for PK (1555) and UNIQUE (2067). PG uses `23505` for both, so callers
  distinguish by `error.constraint`: `users_email_key`, `users_apple_sub_key`, `tasks_pkey`,
  `birthdays_pkey`. `routes/auth.ts` (register → `EMAIL_TAKEN`; the Apple race path at ~line 126) must
  check the constraint name, not just the code.
- A failed statement inside a transaction aborts the whole PG transaction (SQLite didn't). The `/import`
  route validates everything before inserting and relies on `ON CONFLICT DO NOTHING`, so no
  statement is expected to fail mid-transaction; a failure rolls back (R4.1).

### 7.2 Case-insensitive email
Emails are already lower-cased by the app before insert. `users_email_key` on `lower(email)` guards
the rest; lookups use `WHERE lower(email) = lower($1)` so the index is used.

## 8. Data copy (`server/scripts/sqlite-to-postgres.ts`)

```
node --import tsx scripts/sqlite-to-postgres.ts --sqlite /path/app.db --dry-run
node --import tsx scripts/sqlite-to-postgres.ts --sqlite /path/app.db
```
1. Open SQLite with `new DatabaseSync(path, { readOnly: true })`.
2. Connect to PG (`DATABASE_URL`), run migrations, `BEGIN`.
3. Abort if any of the four tables has rows (R5.2).
4. Copy in FK order: `users` → `sessions` (skip `expires_at <= now`) → `tasks` → `birthdays`, reading each
   table `ORDER BY rowid` and inserting in batches of 500 via multi-row `INSERT` with `OVERRIDING SYSTEM
   VALUE` for `seq`. Conversions: `done`/`remind_me` 0/1 → boolean, `password_params` and `remind_offsets`
   text → JSONB (invalid JSON → `[]`/abort with row id).
5. `SELECT setval(pg_get_serial_sequence('tasks','seq'), COALESCE(max(seq),1))` (same for birthdays).
6. Verify (R5.3): per-table counts, per-user task and birthday counts, and a checksum of
   `(id, title, created_at)` for tasks. Mismatch → `ROLLBACK`, exit 1. `--dry-run` does everything then
   rolls back.
7. `COMMIT`, print a summary table.

## 9. Local dev, CI, Docker

- `docker-compose.yml` at repo root: `postgres:16`, volume `pgdata`, healthcheck `pg_isready`,
  port 5432, db/user/password `todo`. Plus `todo_test` DB created by an init script for tests.
- `server/.env.example`: `DATABASE_URL=postgres://todo:todo@localhost:5432/todo`.
- Root `package.json`: `"db": "docker compose up -d db"`.
- **Tests**: `TEST_DATABASE_URL` (default `postgres://todo:todo@localhost:5432/todo_test`).
  `test/helpers.ts` gets `createTestDb()`: creates schema `t_<random>`, sets `search_path` on every pooled
  connection (`options: '-c search_path=…'`), runs migrations, returns `{ pool, drop }`; `drop` runs
  `DROP SCHEMA … CASCADE` and `pool.end()`. `durability.test.ts` (SQLite kill/reopen) is replaced by a
  "data survives a pool restart" test; `db.test.ts` is rewritten for PG pragmas → migrations/constraints.
- **CI** (`.github/workflows/deploy-server.yml`, `test` job): add `services.postgres` (`postgres:16`,
  health-cmd `pg_isready`) and `env: TEST_DATABASE_URL`.
- **Dockerfile**: remove the Node-version/`node:sqlite` guard comment text if no longer relevant (keep
  Node 22), drop `docker-entrypoint.sh`, run as `USER node` directly with `CMD ["node","dist/index.js"]`.
- **fly.toml**: remove `[[mounts]]` and the single-writer comment after cutover; add secret
  `DATABASE_URL` (`fly secrets set DATABASE_URL=…`). Scaling beyond 1 Machine is then allowed (rate
  limiter caveat in OQ2). The workflow's `--ha=false` and `concurrency` comment can be relaxed later.

## 10. Cutover and rollback

Cutover (≤ 15 min write downtime, R6.3):
1. Provision PG, enable backups (R6.5), `fly secrets set DATABASE_URL=…` (the running SQLite version
   ignores it, so this is safe to do early).
2. Keep the PG work on a branch; **do not merge to `main`** (CI auto-deploys `main`) until step 4.
3. Maintenance window: stop the Machine (`fly machine stop`) so nothing writes, then
   `fly ssh sftp get /data/app.db` — a clean stop checkpoints the WAL on shutdown (`closeDatabase`), so
   the single file is complete; also fetch `app.db-wal` if it exists.
4. Run the Copy script locally against that file with `DATABASE_URL` = production; verify its summary.
5. Merge to `main` → CI deploys the PG build → smoke test (§11) → done.

Rollback (until the volume is deleted): redeploy the previous release (`fly releases`, `fly deploy -i
<old image>`) — it still reads `/data/app.db`. Writes made on PG after cutover are **not** carried back;
accept this for the first 24 h by watching error rates, and keep the volume ≥ 14 days. Delete the
volume only after a successful PG backup *restore drill* (R6.5).

## 11. Smoke test after cutover
`scripts/check-hosted-server.sh` (existing) plus: log in with an existing account in the app (proves
password hash + session copy), create/complete/delete a task, add a birthday, register a new user.

## 12. Risks

| Risk | Mitigation |
|------|-----------|
| BIGINT returned as string breaks the app (`createdAt` as `"169…"`) | Global type parser + test asserting `typeof === 'number'` (R1.3). |
| Pool exhaustion / leaked client | `withTransaction` releases in `finally`; test that 50 concurrent failing imports leave `pool.idleCount == pool.totalCount`. |
| Case-insensitive email regression | Test: register `A@x.com`, then `a@x.com` → 409. |
| Slow cold start on managed PG (TLS handshake, sleeping DB) | `connectionTimeoutMillis: 10_000`, retry `SELECT 1` 3× on boot. |
| Task order changes for equal `created_at` | `seq DESC` tie-break + Copy script preserves rowid order. |
| Session loss at cutover | Unexpired sessions are copied (R5.4). |

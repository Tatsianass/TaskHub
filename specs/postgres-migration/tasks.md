# Tasks — PostgreSQL migration

Implements: [requirements.md](requirements.md) using [design.md](design.md).

How to use: do tasks **in order**; each has *Steps*, *Done when* (run it, see it pass) and the
requirement IDs it covers. Tick `[ ]` → `[x]` in the commit that completes it. Commit format:
`T<id>: <summary>` + requirement IDs. If a step can't be done as written, update `design.md` first.

---

## Phase 0 — Preparation

### [x] T0.1 Branch, baseline, decisions
- Steps: `git switch -c feature/postgres-migration`; `npm --prefix server ci && npm run server:test`;
  record result. Confirm OQ1–OQ3 in README with the owner.
- Done when: baseline test result recorded; OQ1 answered (provider chosen).
- Covers: R6.3

### [x] T0.2 Local Postgres
- Steps: add `docker-compose.yml` (design §9) + init script creating `todo_test`; add root script
  `"db": "docker compose up -d db"`.
- Done when: `npm run db` then `psql postgres://todo:todo@localhost:5432/todo -c 'select 1'` works.
- Covers: R7.1

---

## Phase 1 — Connection, config, migrations

### [x] T1.1 Dependencies and config
- Steps: `npm --prefix server i pg` and `-D @types/pg`. Update `config.ts`: add `databaseUrl`
  (throw if missing), `pgPoolMax`, SSL derivation; remove `dbPath`. Update `.env.example`.
- Done when: `config.test.ts` rewritten and green (defaults, missing URL throws, `sslmode` handling,
  URL never appears in error text).
- Covers: R3.1, R3.2, R3.3, R3.6

### [x] T1.2 Test harness
- Steps: `test/helpers.ts` → `createTestDb()` (schema-per-file, design §9); `startApp` takes a `Pool` — switched over in T3.1, when `createApp` itself takes one.
- Done when: a smoke test creates a schema, runs a query, drops the schema.
- Covers: R1.2, R6.2

### [x] T1.3 Pool + migrations
- Steps: rewrite `db/connection.ts`, `db/migrations.ts` (baseline + advisory lock +
  `schema_migrations`), `db/transaction.ts` (async). Register the BIGINT parser.
- Done when `db.test.ts` (rewritten) passes:
  - fresh schema gets all tables/indexes, `schema_migrations` max = 1;
  - running migrations twice is a no-op; two concurrent runs apply once (R2.2);
  - a failing migration rolls back and throws (R2.4); newer version throws (R2.5);
  - each `CHECK`/FK/unique constraint rejects a bad row (R2.3);
  - inserting a BIGINT and reading it back yields `typeof number`.
- Covers: R2.1–R2.5, R1.3, R4.3

---

## Phase 2 — Repositories and routes

### [x] T2.1 Errors
- Steps: `errors.ts` → `PG_UNIQUE_VIOLATION`, `PG_CHECK_VIOLATION`, `isPgError(error, code, constraint?)`.
- Done when: `errors.test.ts` updated and green.
- Covers: R4.2

### [x] T2.2 Users and sessions repos
- Steps: convert `repos/users.ts`, `repos/sessions.ts` to async/`$n` (design §7); `lower(email)` lookups;
  `auth/middleware.ts` async.
- Done when: `repos-auth.test.ts`, `password.test.ts` green; `A@x.com` vs `a@x.com` collide.
- Covers: R1.1, R2.3, R4.4

### [x] T2.3 Auth routes
- Steps: `routes/auth.ts` — await repos; map `users_email_key` → `EMAIL_TAKEN`, `users_apple_sub_key`
  race → re-select (the existing code path at ~line 126).
- Done when: `auth.test.ts`, `apple.test.ts`, `rate-limit.test.ts` green.
- Covers: R1.1, R4.2

### [x] T2.4 Tasks and birthdays
- Steps: convert `repos/tasks.ts`, `repos/birthdays.ts`, `repos/import-ids.ts`; booleans native;
  `remind_offsets` JSONB (drop `parseOffsets`/`JSON.stringify` where the driver handles it — still
  validate on read); ordering via `seq`. Routes await + constraint mapping.
- Done when: `tasks.test.ts`, `birthdays.test.ts`, `validation.test.ts` green, plus new tests: order of
  equal-`created_at` tasks, `createdAt`/`completedAt` are numbers, cross-user isolation.
- Covers: R1.1, R1.3, R1.4, R4.2

### [x] T2.5 Import
- Steps: `routes/import.ts` uses `withTransaction(pool, client => …)` with client-bound repos.
- Done when: `import.test.ts` green; new tests: invalid item rolls back everything; 50 concurrent failing
  imports leave the pool with no checked-out clients.
- Covers: R4.1, R4.3

---

## Phase 3 — App wiring and lifecycle

> Done together with Phase 2: the route tests need `createApp(pool)`, so T3.1–T3.3 landed in the same commit.

### [x] T3.1 `app.ts`, `index.ts`, health
- Steps: `createApp(pool)`; `/health` → `SELECT 1`, 503 `{ok:false}` on failure; `index.ts` async boot with
  retry (3×), graceful shutdown (`server.close` → `pool.end`), hourly expired-session sweep.
- Done when: `app.test.ts` green; manual: `npm run server`, `curl localhost:4000/health` → `{"ok":true}`;
  stop PG → `/health` returns 503; Ctrl-C exits 0 with shutdown log.
- Covers: R3.4, R3.5

### [x] T3.2 Durability test
- Steps: replace `durability.test.ts` — write rows, `pool.end()`, new pool on same schema, rows present.
- Done when: passes.
- Covers: R1.2

### [x] T3.3 Full suite + typecheck
- Done when: `npm --prefix server run build && npm run server:test` all green; root `npx tsc --noEmit` and
  `npm run lint` unchanged vs baseline; `grep -rn "node:sqlite" server/src` only finds the Copy script.
- Covers: R1.1, R1.2

---

## Phase 4 — Data copy

### [x] T4.1 Copy script
- Steps: `server/scripts/sqlite-to-postgres.ts` per design §8, with `--sqlite`, `--dry-run`.
- Done when: test (`test/copy.test.ts`) builds a SQLite file using the old schema + sample data (several
  users, equal-`created_at` tasks, an Apple user, an expired session), runs the script against a test
  schema and asserts: counts, ids, order, booleans, JSONB, sequence value, expired session skipped,
  second run aborts (R5.2), forced mismatch rolls back (R5.3), source file bytes unchanged (R5.5).
- Covers: R5.1–R5.5

### [ ] T4.2 Rehearsal on a real copy
- Steps: `fly ssh sftp get /data/app.db ./tmp/app.db` (safe read of a live file: use a checkpointed copy or
  `sqlite3 .backup`), run the script with `--dry-run` against a staging PG.
- Done when: dry-run summary shows matching counts. Record numbers in the PR.
- Covers: R5.3, R6.3

---

## Phase 5 — Deployment

### [ ] T5.1 CI, Docker, Fly config
- Steps: CI `services.postgres` + `TEST_DATABASE_URL`; simplify Dockerfile/entrypoint; keep `[[mounts]]`
  in `fly.toml` **until after cutover** (needed for rollback); add comment about `DATABASE_URL` secret.
- Done when: CI green on the branch; `docker build server` works and the container starts against local PG.
- Covers: R6.1, R6.2

### [ ] T5.2 Backups
- Steps: enable provider backups/PITR; do one restore drill into a scratch DB.
- Done when: restored DB passes the row-count check from T4.1.
- Covers: R6.5

### [ ] T5.3 Cutover (design §10)
- Steps: follow §10 with the owner present; run smoke test §11 with the **current App Store build**.
- Done when: smoke test passes; error rate normal for 24 h.
- Covers: R6.3, R6.4, R1.1

### [ ] T5.4 Cleanup (≥ 14 days later)
- Steps: delete the Fly volume and `[[mounts]]`, remove `--ha=false`/single-writer comments and
  `docker-entrypoint.sh`; update `docs/PROJECT_OVERVIEW.md`, `server/.env.example`; mark
  `specs/sqlite-migration` and `specs/server-hosting` as superseded.
- Done when: docs contain no SQLite instructions except the Copy script.
- Covers: R6.1, R7.2

---

## Traceability

| Req | Tasks | Req | Tasks |
|-----|-------|-----|-------|
| R1.1 | T2.2–T2.4, T3.3, T5.3 | R4.1 | T2.5 |
| R1.2 | T1.2, T3.2, T3.3 | R4.2 | T2.1, T2.3, T2.4 |
| R1.3 | T1.3, T2.4 | R4.3 | T1.3, T2.5 |
| R1.4 | T2.4 | R4.4 | T2.2 |
| R2.1–R2.5 | T1.3 (R2.3 also T2.2) | R5.1–R5.5 | T4.1 (R5.3 also T4.2) |
| R3.1–R3.3, R3.6 | T1.1 | R6.1 | T5.1, T5.4 |
| R3.4, R3.5 | T3.1 | R6.2 | T1.2, T5.1 |
| R6.3 | T0.1, T4.2, T5.3 | R6.4 | T5.3 |
| R6.5 | T5.2 | R7.1 | T0.2 |
| R7.2 | T5.4 | | |

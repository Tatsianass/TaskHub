# Requirements — PostgreSQL migration

Status: **Draft — awaiting approval**
Notation: EARS (*WHEN* … *THE SYSTEM SHALL* …). IDs are stable; never renumber, only append.

## 1. Goal

Replace the SQLite file database of the API server with PostgreSQL so that data lives in a managed,
backed-up database service, the server no longer depends on a local disk volume, and the API can run
on more than one instance — **without changing behaviour visible to the mobile app**.

## 2. Glossary

| Term | Meaning |
|------|---------|
| Server | The Node.js API in `server/`. |
| PG | PostgreSQL ≥ 15. |
| Legacy DB | The existing SQLite file (`/data/app.db` on Fly). |
| Copy script | One-off script that copies Legacy DB → PG. |

## 3. Scope

**In:** server data layer (connection, migrations, repos, transactions, error mapping), config, tests,
CI, Dockerfile/Fly config, one-off data copy, docs.

**Out:** any change to the HTTP API or to the Expo app, a distributed rate limiter, read replicas,
connection poolers (PgBouncer), ORMs, changing the auth scheme.

## 4. Acceptance criteria

### R1 — Behavioural parity
- **R1.1** THE SYSTEM SHALL keep every endpoint, status code, error code and JSON shape of
  `/auth`, `/tasks`, `/birthdays`, `/import`, `/health` identical to `main`.
- **R1.2** THE SYSTEM SHALL pass the existing server test suite, adapted only for async access and a
  PG test database, with no test deleted or weakened.
- **R1.3** Numeric fields (`createdAt`, `completedAt`, `alertDaysBefore`, `remindOffsets` items)
  SHALL be returned as JSON numbers, never strings.
- **R1.4** Task lists SHALL keep the order `createdAt DESC`, ties broken newest-inserted first;
  birthdays SHALL keep insertion order.

### R2 — Schema and integrity
- **R2.1** THE SYSTEM SHALL create all tables via versioned, append-only migrations applied at start-up.
- **R2.2** WHEN two instances start at once THE SYSTEM SHALL apply each migration exactly once.
- **R2.3** THE SYSTEM SHALL enforce at the database level everything SQLite enforced: primary/unique
  keys, foreign keys with `ON DELETE CASCADE`, `CHECK` constraints on quadrant, tag, non-empty
  title/name, `alert_days_before` 1–60, and case-insensitive unique email.
- **R2.4** WHEN a migration fails THE SYSTEM SHALL roll it back and refuse to start.
- **R2.5** WHEN the DB schema version is newer than the code knows THE SYSTEM SHALL refuse to start.

### R3 — Connection and configuration
- **R3.1** THE SYSTEM SHALL read `DATABASE_URL` and fail fast with a clear message if it is missing
  or unreachable at start-up.
- **R3.2** THE SYSTEM SHALL use a connection pool with configurable size (`PG_POOL_MAX`, default 10).
- **R3.3** WHEN `NODE_ENV=production` THE SYSTEM SHALL require TLS to the database unless the URL
  explicitly says `sslmode=disable`.
- **R3.4** WHEN SIGINT/SIGTERM arrives THE SYSTEM SHALL stop accepting requests, let in-flight ones
  finish, close the pool, and exit 0.
- **R3.5** `GET /health` SHALL report `{ ok: true }` only if a `SELECT 1` succeeds.
- **R3.6** THE SYSTEM SHALL never log `DATABASE_URL`, passwords or request bodies.

### R4 — Transactions and errors
- **R4.1** THE SYSTEM SHALL run `/import` in one transaction on one pooled connection; any failure
  rolls back everything.
- **R4.2** THE SYSTEM SHALL map PG error codes to the same API errors as before:
  unique violation → `EMAIL_TAKEN` / `DUPLICATE_ID`, check violation → `INVALID_TASK` /
  `INVALID_BIRTHDAY`.
- **R4.3** THE SYSTEM SHALL always release a pooled connection, including on error.
- **R4.4** THE SYSTEM SHALL use parameterised queries only; no SQL built by string concatenation
  with user input.

### R5 — Data migration
- **R5.1** THE SYSTEM SHALL provide a Copy script that reads the Legacy DB read-only and writes
  users, sessions, tasks and birthdays into PG preserving ids, timestamps and relative order.
- **R5.2** WHEN any target table is not empty THE Copy script SHALL abort without writing;
  it never overwrites or merges.
- **R5.3** THE Copy script SHALL run in a single transaction and, after the copy, compare
  per-table row counts and a per-user task/birthday count; any mismatch SHALL roll back and exit non-zero.
- **R5.4** Expired sessions MAY be skipped; unexpired sessions SHALL be copied so users stay signed in.
- **R5.5** THE Copy script SHALL be idempotent by refusing to run twice (R5.2) and SHALL never modify
  or delete the Legacy DB.

### R6 — Deployment and operations
- **R6.1** THE Docker image SHALL no longer need a data volume or root-then-drop entrypoint.
- **R6.2** CI SHALL run server tests against a real PG service container.
- **R6.3** Cutover SHALL take ≤ 15 minutes of write downtime and SHALL be reversible
  (see design §10) until the Legacy volume is deliberately deleted.
- **R6.4** WHEN the new version is deployed THE mobile app SHALL keep working with no update
  (verified with the current App Store build and a local build).
- **R6.5** THE SYSTEM SHALL have PG backups enabled (provider point-in-time recovery or daily dump)
  and a documented restore step before the Legacy volume is deleted.

### R7 — Developer experience
- **R7.1** `docker compose up -d db` SHALL give a working local PG, and `npm run server` SHALL run
  against it using `server/.env.example` defaults.
- **R7.2** README/docs (`docs/PROJECT_OVERVIEW.md`, `server/.env.example`, `fly.toml` comments)
  SHALL describe PG, not SQLite.

## 5. Non-functional

- **N1** p95 latency of `GET /tasks` for 1 000 tasks ≤ 150 ms from the same region.
- **N2** Node ≥ 22.13 stays supported; no native addons (the `pg` driver is pure JS).
- **N3** Migrations are forward-only; rollback of the *release* is via the Legacy DB (design §10).

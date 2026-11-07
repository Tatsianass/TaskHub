# Spec: Migrate the server database from SQLite to PostgreSQL

This folder is a **spec-driven development** package (same format as
[`../sqlite-migration`](../sqlite-migration/README.md)). No production code has
been written yet — only the spec. Implement by following the documents in order.

## Documents

| # | File | Purpose |
|---|------|---------|
| 1 | [requirements.md](requirements.md) | *What* must be true when we are done (EARS acceptance criteria). |
| 2 | [design.md](design.md) | *How*: driver, schema, code changes, data copy, deployment, rollback. |
| 3 | [tasks.md](tasks.md) | Ordered, small tasks with "Done when" checks and a traceability table. |

## Rules for the implementing agent

1. Read all three documents, then `AGENTS.md` (Expo docs) before touching code.
2. Work task by task in `tasks.md` order; don't start N+1 until N's "Done when" passes.
3. The spec is the source of truth. To deviate, update `design.md` first, in the same commit.
4. Commit messages: `T<id>: <summary>` and list requirement IDs. Tick the checkbox in the same commit.
5. Never commit `.env`, database dumps, or `server/data/*.db*`.
6. Keep the existing style: 2-space indent, single quotes, ESM with `.js` import suffixes.

## Current state (baseline on `main`)

- `server/` is an Express 5 API using Node's built-in **synchronous** `node:sqlite`
  (`DatabaseSync`), one file `app.db` on a Fly volume, 6 append-only migrations
  (`PRAGMA user_version`).
- Deployed as a **single** Fly Machine because SQLite has one writer
  (`fly deploy --ha=false`).
- The Expo app only talks HTTP to the API (`src/lib/api.ts`, `EXPO_PUBLIC_API_URL`).
  It never touches the database.

## Target state

- The API stores users, sessions, tasks and birthdays in **PostgreSQL**, configured by one
  `DATABASE_URL`.
- **The HTTP API contract does not change**, so the mobile app needs no code change and no
  new App Store build.
- Existing production data is copied over once, with row-count verification.
- The server may run on more than one Machine.

## Decisions to confirm before T0 (defaults in bold)

| # | Question | Default |
|---|----------|---------|
| OQ1 | Where does Postgres live in production? | **Managed Postgres** (Fly Managed Postgres, Neon or Supabase — anything that gives a `DATABASE_URL`). The code is provider-agnostic. |
| OQ2 | Keep the stateful rate limiter in memory? | **Yes** (out of scope; becomes per-Machine if scaled out). |
| OQ3 | Allow a short maintenance window for cutover (~10 min)? | **Yes** — simplest and safest. |

# Spec: Migrate persistence to a SQLite-backed server

Branch: `feature/sqlite-migration` (cut from `main` at `8509aa6`).

This folder is a **spec-driven development** package. An AI agent (or a human)
implements the migration by following these documents in order. No production
code has been written yet — only the spec.

## Documents

| # | File | Purpose | Changes when… |
|---|------|---------|---------------|
| 1 | [requirements.md](requirements.md) | *What* must be true when we are done. User stories + numbered acceptance criteria (EARS style). | Product scope changes. |
| 2 | [design.md](design.md) | *How* it will be built: architecture, SQLite schema, HTTP API contract, client changes, durability strategy. | A technical decision changes. |
| 3 | [tasks.md](tasks.md) | *Step-by-step* implementation plan. Each task is small, ordered, references the requirement IDs it satisfies, and has a "Done when" check. | Work is completed (tick the boxes) or re-planned. |

## Rules for the implementing agent

1. **Read all three documents before touching code.** Then read `AGENTS.md`:
   Expo changed — consult the versioned docs at
   https://docs.expo.dev/versions/v57.0.0/ before using any Expo API
   (in particular `expo-secure-store`).
2. **Work strictly task by task** in `tasks.md` order. Do not start task N+1
   until task N's "Done when" check passes.
3. **The spec is the source of truth.** If the code needs to deviate from the
   design, update `design.md` (and `requirements.md` if scope changes) *first*,
   in the same commit as the code, and explain why in the commit message.
4. **Trace everything.** Each commit message references task IDs
   (e.g. `T2.3`) and every requirement ID must be covered by at least one task
   (see the traceability table at the end of `tasks.md`).
5. **Tick the checkbox** of a task in `tasks.md` in the same commit that
   completes it.
6. **Never commit** the database file (`server/data/*.db*`) or `.env` files.
7. Keep the style of the existing code: 2-space indent, single quotes,
   functional React components, `@/` path alias in the app.

## Current state (baseline on `main`)

- All data lives only on the device in AsyncStorage
  (`auth:users`, `auth:session`, `task-manager:tasks:v3`,
  `task-manager:birthdays:v1`, `settings:*`).
- Passwords: SHA-256(salt:password) stored locally in `auth:users`.
- Tasks/birthdays are **not** scoped per user.
- `src/lib/supabase.ts` and `@supabase/supabase-js` exist but are unused.

## Target state

- A small Node.js HTTP server in `server/` owns a **SQLite database file**
  on disk (`server/data/app.db` by default).
- User credentials (scrypt-hashed), sessions, tasks and birthdays live in
  that file. Stopping, crashing or restarting the server loses nothing —
  on the next start it re-opens the same file.
- The Expo app talks to the server over HTTP with a bearer session token.

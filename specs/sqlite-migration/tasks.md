# Tasks — SQLite persistence migration

Implements: [requirements.md](requirements.md) using [design.md](design.md).

How to use this file (for the implementing agent):
- Do tasks **in order**. Each has *Steps*, *Done when* (a check you must run
  and see pass), and the requirement IDs it covers.
- Tick `[x]` in the same commit that completes the task. Commit message
  format: `T<id>: <summary>` + body listing requirement IDs.
- If a step can't be done as written, stop, update `design.md` with the
  reason and the new approach, then continue.
- Don't skip "Done when" checks; paste their output into the commit body
  when it is short.

---

## Phase 0 — Preparation

### [x] T0.1 Confirm branch and baseline
- Steps:
  1. `git switch feature/sqlite-migration` (create from `main` if missing).
  2. `npm install` at the root; run `npx tsc --noEmit` and `npm run lint`;
     record any **pre-existing** errors in the commit body so they aren't
     blamed on this work.
  3. `node -v` must be ≥ 22.13 (`node:sqlite`). If lower, stop and ask.
- Done when: baseline results recorded.
- Covers: N2

### [x] T0.2 Read the docs
- Steps: read `AGENTS.md`; open https://docs.expo.dev/versions/v57.0.0/sdk/securestore/
  and note the exact API names/install command for SDK 57. Read
  https://nodejs.org/api/sqlite.html for `DatabaseSync`, `prepare`, `exec`.
  If anything contradicts `design.md`, update `design.md` first.
- Done when: `design.md` matches the real APIs (commit only if changed).

---

## Phase 1 — Server skeleton and durable database

### [x] T1.1 Scaffold `server/` package
- Steps:
  1. Create `server/package.json` (`"private": true`, `"type": "module"`,
     `"engines": {"node": ">=22.13"}`), scripts:
     `dev: node --watch --import tsx src/index.ts` (not `tsx watch`, see design §3), `build: tsc`, `start: node dist/index.js`,
     `test: node --import tsx --test "test/**/*.test.ts"` (glob **quoted** so
     Node expands it — npm runs scripts via `sh`, which has no `**` globstar
     and would silently skip `test/*.test.ts`).
  2. Deps: `express@^5`, `cors`. Dev deps: `typescript`, `tsx`,
     `@types/node`, `@types/express`, `@types/cors`.
  3. `server/tsconfig.json`: `module`/`moduleResolution` `NodeNext`,
     `target ES2023`, `strict`, `outDir dist`, `rootDir src`.
  4. `server/.env.example` with `PORT`, `DB_PATH`, `CORS_ORIGIN` (design §8).
  5. `server/data/.gitkeep`.
  6. Root `.gitignore`: add `server/data/*.db`, `server/data/*.db-*`,
     `server/.env`, `server/dist/`, `server/node_modules/`.
  7. Root `tsconfig.json`: add `"exclude": ["server"]`.
     Root `eslint.config.js`: add `"server/*"` to `ignores`.
- Done when: `npm --prefix server install` succeeds; root `npx tsc --noEmit`
  unchanged vs baseline; `git status` doesn't show anything under `server/data` except `.gitkeep`.
- Covers: R3.7

### [x] T1.2 Config module
- Steps: `server/src/config.ts` reads `PORT` (default 4000), `DB_PATH`
  (default `data/app.db` resolved against the `server/` dir via
  `import.meta.dirname`, **not** `process.cwd()`), `CORS_ORIGIN`
  (default `http://localhost:8081`, comma-separated list allowed). Load
  `server/.env` with `process.loadEnvFile()` if the file exists.
- Done when: unit test asserts defaults and overrides.
- Covers: R3.1, R7.3

### [x] T1.3 Database connection + migrations
- Steps: implement `db/connection.ts` and `db/migrations.ts` exactly as in
  design §4.1–4.3 (schema v1). Export `openDatabase(path)` and `closeDatabase(db)`
  (checkpoint + close).
- Done when tests pass:
  - opening a non-existent path in a temp dir creates the file and
    `PRAGMA user_version` = 1 (R3.3);
  - `PRAGMA journal_mode` returns `wal`, `foreign_keys` = 1, `synchronous` = 2 (R3.5);
  - insert a row, close, reopen same path → row still there,
    `user_version` still 1, no error (R3.2, R3.4);
  - running migrations twice is a no-op.
- Covers: R3.1–R3.5

### [x] T1.4 App factory, errors, health, lifecycle
- Steps:
  1. `errors.ts`: `class ApiError { status; code }` + express error
     middleware → `res.status(status).json({ error: code })`; unknown errors
     → 500 `INTERNAL` (log stack, never the body).
  2. `app.ts`: `createApp(db)` with `cors({ origin })`,
     `express.json({ limit: '1mb' })`, `GET /health`.
  3. `index.ts`: bootstrap + graceful shutdown as in design §6. Log the
     absolute DB path on start.
- Done when: `npm --prefix server run dev` then `curl localhost:4000/health`
  → `{"ok":true}`; Ctrl-C prints a shutdown line and exits 0; `server/data/app.db` exists.
- Covers: R3.6, R7.3

---

## Phase 2 — Credentials and sessions (server)

### [x] T2.1 Password hashing
- Steps: `auth/password.ts` — `hashPassword(pw) → {hash, salt, params}` with
  `crypto.scrypt` (promisified) N=16384 r=8 p=1 keylen=64, salt
  `randomBytes(16)`; `verifyPassword(pw, stored)` using `timingSafeEqual`.
  Also export `DUMMY_HASH` computed once for missing-user timing.
- Done when: tests — correct pw verifies, wrong pw fails, two hashes of same
  pw differ (salt), hash string doesn't contain the password.
- Covers: R1.2, R1.7

### [x] T2.2 Tokens and users/sessions repos
- Steps: `auth/tokens.ts` (`newToken()` = 32 random bytes base64url,
  `hashToken()` = sha256 hex). `repos/users.ts`
  (`create`, `findByEmail`, `findById`), `repos/sessions.ts`
  (`create(userId)` → returns raw token and stores hash with
  `expires_at = now + 30d`, `findValid(tokenHash)`, `delete(tokenHash)`,
  `deleteExpired()` called on startup). Use prepared statements only — no
  string-concatenated SQL.
- Done when: tests — DB `sessions.token_hash` ≠ raw token; expired session
  not returned; duplicate email insert throws a constraint error.
- Covers: R1.3, R2.1–R2.3

### [x] T2.3 Auth routes + middleware
- Steps: implement `/auth/register`, `/auth/login`, `/auth/me`,
  `/auth/logout` per design §5; `requireAuth` middleware parses
  `Authorization: Bearer`, sets `req.userId`, returns 401
  `UNAUTHORIZED`/`SESSION_EXPIRED`. Normalize email (trim, lowercase).
  Validate: empty → `ENTER_EMAIL_PASSWORD`; `< 8` chars → `PASSWORD_TOO_SHORT`;
  map unique-constraint error → 409 `EMAIL_TAKEN`. On unknown email still
  run `verifyPassword` against `DUMMY_HASH`.
- Done when: integration tests for every row of the auth table in design §5
  pass, including: register → me works; logout → me returns 401;
  `" Foo@Bar.com "` and `"foo@bar.com"` are the same account.
- Covers: R1.1, R1.3–R1.6, R2.1, R2.4, R2.7

---

## Phase 3 — Tasks, birthdays, import (server)

### [x] T3.1 Validation module
- Steps: `validation.ts` with `parseTask(body)` and `parseBirthday(body)`
  returning typed objects or throwing `ApiError(400, 'INVALID_TASK' |
  'INVALID_BIRTHDAY')`. Rules: trimmed non-empty title/name; quadrant/tag
  enums from `src/constants` values (copy the literal lists — the server
  must not import app code); dates `^\d{4}-\d{2}-\d{2}$` and a real date;
  time `^\d{2}:\d{2}$`; booleans strictly boolean; `createdAt` finite number.
- Done when: table-driven unit tests for valid + each invalid case.
- Covers: R4.5

### [x] T3.2 Tasks repo + routes
- Steps: `repos/tasks.ts` (row↔Task mapping, every statement has
  `WHERE user_id = ?`). Routes `GET/POST /tasks`, `PUT/DELETE /tasks/:id`
  behind `requireAuth`. `PUT` of a task owned by another user → 404.
- Done when: integration tests — CRUD round-trip; ordering by `createdAt` desc;
  user B gets 404 on user A's task for PUT and DELETE and doesn't see it in GET.
- Covers: R4.1, R4.2

### [x] T3.3 Birthdays repo + routes
- Steps: same pattern for birthdays (`GET`, `POST`, `DELETE /birthdays/:id`).
- Done when: same style of tests as T3.2, incl. cross-user isolation.
- Covers: R5.1

### [x] T3.4 Import endpoint
- Steps: `POST /import` validates every item with T3.1; in one transaction
  inserts tasks/birthdays with `INSERT … ON CONFLICT(id) DO NOTHING` for
  same-user duplicates; if the id belongs to a different user, insert with
  an id derived from (user, id) — see design §4.3 (was `randomUUID()`,
  which broke idempotency). Return counts.
- Done when: tests — importing the same payload twice gives the same row
  count; an invalid item rejects the whole import (nothing written).
- Covers: R6.2

### [x] T3.5 Durability tests (the key acceptance test)
- Steps: `test/durability.test.ts`:
  1. In-process: temp `DB_PATH`; `createApp(openDatabase(p))`; register, create
     task + birthday; `closeDatabase`; reopen same path with a new app; login
     with the same password → 200; `GET /tasks` returns the task.
  2. Out-of-process: spawn `node --import tsx src/index.ts` with
     `DB_PATH=<tmp>` and a random `PORT`; wait for `/health`; register + add
     task; `child.kill('SIGKILL')`; spawn again on same path; login + task present.
  3. Same as 2 but with `SIGTERM`; assert exit code 0 and that the `-wal`
     file is empty/absent afterwards (checkpoint ran).
- Done when: `npm --prefix server test` is all green.
- Covers: R3.2, R3.5, R3.6, R3.8, N1

---

## Phase 4 — App: API client and auth

### [x] T4.1 Remove Supabase, add config
- Steps: delete `src/lib/supabase.ts`; `npm uninstall @supabase/supabase-js`;
  uninstall `react-native-url-polyfill` if `grep -r url-polyfill src` is
  empty. Replace `.env.example` contents with `EXPO_PUBLIC_API_URL=http://localhost:4000`
  plus a comment block with the per-platform URLs (design §8). Tell the user
  to update their local `.env` (do not edit or read their `.env` values).
- Done when: `grep -ri supabase src package.json .env.example` is empty; `tsc` baseline.
- Covers: R7.1, R8.1

### [x] T4.2 Install SecureStore and token storage
- Steps: `npx expo install expo-secure-store` (use the command from T0.2 docs;
  add a config plugin to `app.json` only if the docs require it). Create
  `src/lib/token-storage.ts` and `src/lib/token-storage.web.ts` per design §7.2
  exporting `getToken`, `setToken`, `clearToken`.
- Done when: `tsc` passes; web file has SSR guard.
- Covers: R2.5, N3

### [x] T4.3 API client
- Steps: `src/lib/api.ts` per design §7.1 (base URL check, bearer header,
  10 s timeout, `ApiError`, `setAuthToken`, `setOnUnauthorized`).
- Done when: `tsc` passes; manual check in the web preview console that a
  call with the server stopped rejects with `SERVER_UNREACHABLE` within ~10 s.
- Covers: R7.1, R7.2

### [x] T4.4 Rewrite AuthProvider
- Steps: rewrite `src/context/auth-context.tsx` per design §7.3. Keep the
  exported names and context shape. Remove `expo-crypto` import and the
  `auth:users` / `auth:session` logic. Wire `setOnUnauthorized(() => logout-local)`.
  If `expo-crypto` is no longer imported anywhere, `npm uninstall expo-crypto`.
- Done when: web preview — register new user → lands on home; reload page →
  still logged in; logout → login screen; login with wrong password shows the
  translated `WRONG_PASSWORD` message; nothing under `auth:*` in
  `localStorage` (only the token key).
- Covers: R1.1, R2.5, R2.6, R2.7, R8.2

### [x] T4.5 i18n
- Steps: in `src/i18n/translations.ts` for **every** locale (ru, en, es, fr, de, pt, zh):
  update `errors.PASSWORD_TOO_SHORT` to 8 characters; add
  `errors.SERVER_UNREACHABLE`, `errors.SESSION_EXPIRED`, `errors.UNAUTHORIZED`,
  `errors.INVALID_TASK`, `errors.INVALID_BIRTHDAY`, `errors.NOT_FOUND`,
  `errors.INTERNAL`, `errors.UNKNOWN`, `import.prompt.title`,
  `import.prompt.message`, `import.prompt.yes`, `import.prompt.no`.
  Match the existing tone per language.
- Done when: every locale object has identical key sets (write a tiny
  one-off node check or compare with `tsc` if the file is typed).
- Covers: R1.6, R7.2, R6.1

---

## Phase 5 — App: data hooks

### [x] T5.1 Rewrite `useTasks`
- Steps: per design §7.4. Keep `STORAGE_KEY` constant only inside
  `legacy-import.ts` now. Public return: `tasks, isLoaded, addTask,
  updateTask, toggleTask, deleteTask` + additive `error, clearError`.
  Snapshot-and-rollback on failure. Refetch when `user?.id` changes.
- Done when: `tsc` passes with **no changes** to `src/app/index.tsx` or
  `src/app/calendar.tsx`; in web preview add/edit/toggle/delete a task, stop
  the server, try another edit → UI rolls back and shows the error.
- Covers: R4.1, R4.3, R4.4

### [ ] T5.2 Rewrite `useBirthdays`
- Steps: same pattern; `birthdays.tsx` unchanged except optionally rendering `error`.
- Done when: same checks as T5.1 for birthdays.
- Covers: R5.1

### [ ] T5.3 Surface hook errors in UI
- Steps: show `t(\`errors.${error}\`)` as a dismissible banner/text on home,
  calendar and birthdays screens using existing components (`ThemedText`,
  `GlassPanel`). Keep it minimal.
- Done when: error from T5.1 check is visible and dismissible.
- Covers: R4.4, R7.2

### [ ] T5.4 Legacy data import
- Steps: `src/lib/legacy-import.ts` + prompt flow per design §7.5. Use
  `Alert.alert` on native and `window.confirm` on web.
- Done when (web preview): on `main` build add 2 tasks + 1 birthday; switch to
  this branch; register → prompt appears → Yes → items visible and fetched from
  server (confirm via `curl` with the token or by reloading); legacy keys gone
  from `localStorage`. Repeat with No → keys gone, nothing imported.
- Covers: R6.1–R6.4

---

## Phase 6 — Tooling, docs, verification

### [ ] T6.1 Dev tooling
- Steps: add to `.claude/launch.json` an `api-server` configuration
  (`npm --prefix server run dev`, port 4000). Add root scripts
  `"server": "npm --prefix server run dev"` and
  `"server:test": "npm --prefix server test"`.
- Done when: both preview configs start.

### [ ] T6.2 README
- Steps: replace the template README sections with: architecture summary,
  prerequisites (Node ≥ 22.13), how to run server + app, `EXPO_PUBLIC_API_URL`
  per platform, where the DB file lives, how to back it up (stop server, copy
  `app.db`; or `sqlite3 app.db ".backup backup.db"` while running), how to reset
  (stop server, delete `server/data/app.db*`).
- Done when: a fresh clone following only the README reaches a working login.
- Covers: N4

### [ ] T6.3 Full verification (release gate)
- Steps / Done when — all must pass:
  - [ ] `npm --prefix server test` green.
  - [ ] root `npx tsc --noEmit` and `npm run lint` — no new errors vs T0.1.
  - [ ] Manual restart scenario (web): register, add task + birthday →
        stop server (Ctrl-C) → start again → reload app → still logged in,
        data present.
  - [ ] Manual crash scenario: same, but `kill -9 <server pid>`.
  - [ ] iOS simulator: login with the account created on web → same data
        (proves credentials are server-side).
  - [ ] `sqlite3 server/data/app.db "select email, password_hash from users"`
        shows scrypt hashes, no plaintext.
  - [ ] `git status` / `git ls-files server/data` shows only `.gitkeep`.
- Covers: all

### [ ] T6.4 Open PR
- Steps: push branch, open PR to `main` titled
  "Migrate persistence to a SQLite-backed server"; body links this spec and
  pastes the T6.3 checklist results. Only when the user asks.

---

## Traceability

| Requirement | Tasks |
|---|---|
| R1.1 | T2.3, T4.4 |
| R1.2 | T2.1 |
| R1.3 | T2.2, T2.3 |
| R1.4–R1.5 | T2.3 |
| R1.6 | T2.3, T4.5 |
| R1.7 | T2.1 |
| R2.1–R2.3 | T2.2, T2.3 |
| R2.4 | T2.3 |
| R2.5 | T4.2, T4.4 |
| R2.6–R2.7 | T4.4, T2.3 |
| R3.1–R3.5 | T1.2, T1.3, T3.5 |
| R3.6 | T1.4, T3.5 |
| R3.7 | T1.1 |
| R3.8 | T3.5 |
| R4.1–R4.2 | T3.2, T5.1 |
| R4.3–R4.4 | T5.1, T5.3 |
| R4.5 | T3.1 |
| R5.1 | T3.3, T5.2 |
| R6.1–R6.4 | T3.4, T5.4, T4.5 |
| R7.1–R7.2 | T4.1, T4.3, T5.3 |
| R7.3 | T1.2, T1.4 |
| R8.1–R8.2 | T4.1, T4.4 |
| N1 | T1.3–T3.5 |
| N2 | T0.1, T6.3 |
| N3 | T4.2 |
| N4 | T6.2 |

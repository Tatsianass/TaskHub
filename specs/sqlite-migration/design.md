# Design — SQLite persistence migration

Status: **Draft — awaiting approval**
Implements: [requirements.md](requirements.md)

## 1. Architecture

```
┌──────────────────────────┐   HTTPS/HTTP JSON    ┌──────────────────────────┐
│ Expo app (iOS/Android/web)│  Authorization:     │ server/ (Node 24, TS)     │
│                          │  Bearer <token>      │                          │
│ AuthProvider ──┐         │ ───────────────────▶ │ routes → services → repo │
│ useTasks ──────┼─ api.ts │ ◀─────────────────── │            │             │
│ useBirthdays ──┘         │                      │            ▼             │
│ token: SecureStore / LS  │                      │   node:sqlite DatabaseSync│
└──────────────────────────┘                      │            │             │
                                                  └────────────┼─────────────┘
                                                               ▼
                                                  server/data/app.db (+ -wal, -shm)
                                                  persists across restarts
```

Why a server and not on-device SQLite (`expo-sqlite`)? The requirement is that
credentials are stored in a database that outlives a server process and is
shared across clients. An on-device DB would keep the current "accounts exist
only on one phone" limitation (see requirements §1).

## 2. Repository layout (new/changed)

```
server/                      NEW — separate npm package, not bundled by Metro
  package.json               "type": "module", scripts: dev, start, test
  tsconfig.json
  .env.example               PORT, DB_PATH, CORS_ORIGIN
  data/.gitkeep              DB file lives here (git-ignored)
  src/
    index.ts                 bootstrap: config → db → app → listen → signals
    config.ts                env parsing with defaults
    db/
      connection.ts          open file, pragmas, close()
      migrations.ts          versioned migrations via PRAGMA user_version
    auth/
      password.ts            scrypt hash/verify
      tokens.ts              generate token, sha256
      middleware.ts          requireAuth → req.userId
    repos/
      users.ts sessions.ts tasks.ts birthdays.ts
    routes/
      auth.ts tasks.ts birthdays.ts import.ts
    validation.ts            shared validators for Task/Birthday payloads
    errors.ts                ApiError(status, code)
    app.ts                   express app factory: createApp(db)
  test/
    *.test.ts                node:test + supertest-like fetch against createApp
src/lib/api.ts               NEW — fetch wrapper (base URL, token, timeout, errors)
src/lib/token-storage.ts     NEW — SecureStore on native
src/lib/token-storage.web.ts NEW — localStorage on web
src/lib/legacy-import.ts     NEW — read/clear old AsyncStorage keys
src/context/auth-context.tsx REWRITE
src/hooks/use-tasks.ts       REWRITE (same public API)
src/hooks/use-birthdays.ts   REWRITE (same public API)
src/i18n/translations.ts     new error keys, updated PASSWORD_TOO_SHORT text
src/lib/supabase.ts          DELETE
tsconfig.json                exclude "server"
eslint.config.js             ignore "server/*" (server has its own lint if any)
.gitignore                   server/data/*.db*, server/.env
.env.example                 replace Supabase vars with EXPO_PUBLIC_API_URL
```

## 3. Technology choices

| Concern | Choice | Reason |
|---|---|---|
| Runtime | Node 24 (`engines: ">=22.13"`) | Installed locally; ships `node:sqlite`. |
| SQLite driver | `node:sqlite` `DatabaseSync` | Zero native deps, synchronous API = simple transactions. Fallback: `better-sqlite3` has a near-identical API if `node:sqlite` misbehaves. |
| HTTP | `express@5` + `cors` | Familiar, async error handling built into v5. |
| TS execution | `tsx` as a loader for dev/test (`node --watch --import tsx`, `node --import tsx --test`), `tsc` build to `dist/` for start | No transpile step during dev. Not `tsx watch`: on Ctrl-C it receives SIGINT twice (from the terminal and from the npm wrapper) and SIGKILLs the server during its graceful shutdown (R3.6). Node's own `--watch` restarts with SIGTERM and exits cleanly. |
| Password hash | `crypto.scrypt` (N=16384, r=8, p=1, keylen=64, salt 16 B) | Built-in, memory-hard, no native module. |
| Tests | `node:test` + `node:assert`, HTTP via `fetch` on an ephemeral port | Built-in. |
| App token storage | `expo-secure-store` (native), `localStorage` (web) | Keychain/Keystore encryption on device; SecureStore has no web support. |

## 4. Database

### 4.1 Connection (`db/connection.ts`) — satisfies R3.1–R3.5

```ts
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDatabase(path: string) {
  mkdirSync(dirname(path), { recursive: true });          // R3.3
  const db = new DatabaseSync(path);                      // opens or creates file
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `);
  runMigrations(db);                                      // R3.2, R3.4
  return db;
}
```

Never use `:memory:` outside tests. Never `DROP TABLE` in a migration that
runs on an existing DB unless data is copied first.

### 4.2 Migrations (`db/migrations.ts`) — R3.4

```ts
const migrations: string[] = [ /* index 0 → user_version 1 */ V1_SQL ];

export function runMigrations(db) {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  for (let v = current; v < migrations.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(migrations[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
}
```

`runMigrations` also refuses to start (throws) if `user_version` is greater
than `migrations.length`, i.e. the DB file was written by a newer server
version; running old code against a newer schema could corrupt data.
It takes the migration list as an optional parameter (defaulting to the real
one) so tests can exercise rollback of a failing migration.

### 4.3 Schema v1

```sql
CREATE TABLE users (
  id            TEXT PRIMARY KEY,                 -- crypto.randomUUID()
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,                    -- base64
  password_salt TEXT NOT NULL,                    -- base64
  password_params TEXT NOT NULL,                  -- JSON {"N":16384,"r":8,"p":1,"keylen":64}
  created_at    INTEGER NOT NULL                  -- epoch ms
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,                    -- sha256(token) hex, R2.2
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL                     -- created_at + 30d, R2.3
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE tasks (
  id          TEXT PRIMARY KEY,                   -- client-generated id kept (R6.2)
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description TEXT NOT NULL DEFAULT '',
  quadrant_id TEXT NOT NULL CHECK (quadrant_id IN
    ('urgent-important','not-urgent-important','urgent-not-important','not-urgent-not-important')),
  tag         TEXT CHECK (tag IS NULL OR tag IN ('work','home')),
  done        INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0,1)),
  created_at  INTEGER NOT NULL,                   -- epoch ms, matches Task.createdAt
  due_date    TEXT,                               -- 'YYYY-MM-DD'
  remind_me   INTEGER NOT NULL DEFAULT 0 CHECK (remind_me IN (0,1)),
  remind_time TEXT                                -- 'HH:mm'
);
CREATE INDEX idx_tasks_user_created ON tasks(user_id, created_at DESC);

CREATE TABLE birthdays (
  id      TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name    TEXT NOT NULL CHECK (length(trim(name)) > 0),
  date    TEXT NOT NULL                           -- 'YYYY-MM-DD'
);
CREATE INDEX idx_birthdays_user ON birthdays(user_id);
```

Note on ids: `id` is globally unique (PK), but every query also filters by
`user_id` so one user can never read/modify another user's row (R4.2).
If an import sends an id that already exists for **another** user, the
server generates a new id for that row instead of skipping.

Row ↔ API mapping (done in repos): snake_case ↔ camelCase, `0/1` ↔ boolean.

### 4.4 `node:sqlite` facts (verified on Node 24.21 in T0.2)

- Runs without a flag and without an `ExperimentalWarning`.
- `new DatabaseSync(path)` already defaults `enableForeignKeyConstraints: true`;
  we still set the `PRAGMA foreign_keys = ON` for explicitness.
- `stmt.get()` returns a **null-prototype** object (or `undefined`);
  `stmt.run()` returns `{ changes, lastInsertRowid }`. In TypeScript the row
  type is `Record<string, SQLOutputValue>`, so repos cast rows to a local
  row interface before mapping.
- Constraint violations throw `Error` with `code: 'ERR_SQLITE_ERROR'` and an
  extended SQLite result code in `errcode` (message e.g.
  `UNIQUE constraint failed: users.email`). Map by `errcode`, never by message:

  | `errcode` | Meaning | Mapped to |
  |---|---|---|
  | 2067 `SQLITE_CONSTRAINT_UNIQUE` | duplicate `users.email` | 409 `EMAIL_TAKEN` |
  | 1555 `SQLITE_CONSTRAINT_PRIMARYKEY` | duplicate task/birthday `id` | 409 `DUPLICATE_ID` |
  | 275 `SQLITE_CONSTRAINT_CHECK` | CHECK failed (should be caught by validation first) | 400 `INVALID_TASK` / `INVALID_BIRTHDAY` |

- No transaction helper exists; use `BEGIN`/`COMMIT`/`ROLLBACK` via `exec`
  as in §4.2 (`db.isTransaction` is available for assertions).
- `PRAGMA wal_checkpoint(TRUNCATE)` returns `{ busy, log, checkpointed }`.

## 5. HTTP API

Base: `http://<host>:4000`. JSON in/out. All error responses:
`{ "error": "<CODE>" }` where CODE is an existing/new i18n key suffix.

Errors that apply to every route (T1.4): unknown route → 404 `NOT_FOUND`;
malformed JSON body → 400 `INVALID_JSON`; body over 1 MB → 413
`PAYLOAD_TOO_LARGE`; any unexpected exception → 500 `INTERNAL` (stack
logged, body never logged). The App shows `errors.UNKNOWN` for any code it
has no translation for.

| Method | Path | Auth | Body | 2xx response | Errors |
|---|---|---|---|---|---|
| GET | `/health` | – | – | `200 {ok:true}` | – |
| POST | `/auth/register` | – | `{email,password}` | `201 {token,user:{id,email}}` | 400 `ENTER_EMAIL_PASSWORD`, 400 `PASSWORD_TOO_SHORT`, 409 `EMAIL_TAKEN` |
| POST | `/auth/login` | – | `{email,password}` | `200 {token,user}` | 400 `ENTER_EMAIL_PASSWORD`, 404 `USER_NOT_FOUND`, 401 `WRONG_PASSWORD` |
| GET | `/auth/me` | ✓ | – | `200 {user}` | 401 `UNAUTHORIZED` / `SESSION_EXPIRED` |
| POST | `/auth/logout` | ✓ | – | `204` | 401 |
| GET | `/tasks` | ✓ | – | `200 Task[]` (created_at DESC) | 401 |
| POST | `/tasks` | ✓ | `Task` (client id, createdAt) | `201 Task` | 400 `INVALID_TASK`, 409 `DUPLICATE_ID` |
| PUT | `/tasks/:id` | ✓ | `TaskDraft` fields + `done` | `200 Task` | 400, 404 `NOT_FOUND` |
| DELETE | `/tasks/:id` | ✓ | – | `204` | 404 |
| GET | `/birthdays` | ✓ | – | `200 Birthday[]` | 401 |
| POST | `/birthdays` | ✓ | `Birthday` | `201 Birthday` | 400 `INVALID_BIRTHDAY` |
| DELETE | `/birthdays/:id` | ✓ | – | `204` | 404 |
| POST | `/import` | ✓ | `{tasks:Task[],birthdays:Birthday[]}` | `200 {tasksImported,birthdaysImported}` | 400 |

`Task`/`Birthday` JSON shapes are exactly those in `src/types/task.ts` and
`src/types/birthday.ts`. The client keeps generating ids (existing format)
so optimistic inserts don't need an id swap.

Validation (`validation.ts`, T3.1): `parseTask` / `parseBirthday` check a full
object (POST, `/import`); `parseTaskUpdate` checks a `PUT /tasks/:id` body —
every `Task` field except `id` (taken from the URL) and `createdAt`
(immutable), which are ignored if present so the client can send the whole
task. Strings are trimmed, unknown fields dropped, ids are 1–128 chars,
dates must be real calendar dates and times 24-hour `00:00`–`23:59`.

Security notes:
- `USER_NOT_FOUND` vs `WRONG_PASSWORD`: distinct codes
  allow email enumeration. Kept to preserve current UX (R2.7); flagged for
  a later change to a single `INVALID_CREDENTIALS`.
- Always run scrypt on login even when the user is missing (hash against a
  dummy salt) to keep timing uniform.
- Body size limit 1 MB (`express.json({ limit: '1mb' })`).
- Never log request bodies on `/auth/*`.

## 6. Server lifecycle — R3.6, R3.8

```ts
// index.ts
const db = openDatabase(config.dbPath);
const server = createApp(db).listen(config.port);
function shutdown(signal) {
  server.close(() => {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
```

Because `DatabaseSync` is synchronous, a handler's write is committed before
`res.json()` runs (R3.8). Multi-row writes (`/import`) use one
`BEGIN … COMMIT` transaction.

Even without graceful shutdown (crash / `kill -9`), WAL + `synchronous=FULL`
guarantees committed transactions are recovered on next open.

## 7. App changes

### 7.1 `src/lib/api.ts`

```ts
export class ApiError extends Error { constructor(public code: string, public status: number) { super(code); } }
export async function api<T>(path: string, opts?: { method?: string; body?: unknown }): Promise<T>
```
- Base URL from `process.env.EXPO_PUBLIC_API_URL` (throw at import if missing, R7.1).
- Adds `Authorization` header from an in-memory token set by AuthProvider.
- `AbortController` timeout 10 s; network failure/timeout → `ApiError('SERVER_UNREACHABLE', 0)` (R7.2).
- Non-2xx → `ApiError(body.error ?? 'UNKNOWN', status)`.
- Exposes `setOnUnauthorized(cb)` so a 401 anywhere logs the user out (R2.6).

Error messages thrown keep today's contract: `error.message` is the code, and
screens call `t(\`errors.${code}\`)` — so `login.tsx`/`register.tsx` need no changes.

### 7.2 Token storage

`token-storage.ts` (native): `SecureStore.getItemAsync / setItemAsync /
deleteItemAsync('session-token')`.
Verified against the SDK 57 docs (T0.2): install with
`npx expo install expo-secure-store`; import `* as SecureStore from
'expo-secure-store'`; keys may only contain alphanumerics, `.`, `-`, `_`
(`session-token` is valid); the ~43-char token is far below the ~2 KB value
limit some iOS versions enforce. The config plugin is **optional** (only for
Face ID prompts / Android backup), so `app.json` is not changed. Web is not
supported, hence the `.web.ts` variant below.
`token-storage.web.ts`: same interface over `localStorage`, wrapped in
try/catch and guarded for `typeof window === 'undefined'` (Expo Router's
Node render pass — see the old comment in `src/lib/supabase.ts`).

### 7.3 `AuthProvider`

Keeps the same context shape `{ user, isLoading, register, login, logout }`.
- Mount: read token → if present `GET /auth/me` → set user or clear token.
- `register/login`: client-side quick checks (same codes), call API, save token, set user.
- `logout`: `POST /auth/logout` (ignore network errors), delete token, set user null.
- `user.id` becomes the server UUID (was the email). Grep for any code relying on `user.id === email` — currently none besides display.

### 7.4 `useTasks` / `useBirthdays`

- Depend on `useAuth().user`. When `user` changes: if null → reset to `[]`,
  `isLoaded=false`; else `GET /tasks` → set state, `isLoaded=true`.
- Mutations: compute new state optimistically via `setTasks`, fire the
  request; on failure restore previous snapshot and surface an error
  (add `error: string | null` + `clearError()` to the returned object —
  additive, doesn't break existing destructuring).
- `toggleTask` sends `PUT` with the full updated task.
- `useBirthdays` is used directly by `birthdays.tsx` (no provider); that's fine,
  it fetches when mounted.

### 7.5 Legacy import — R6

`legacy-import.ts`:
- `readLegacyData()` → `{ tasks, birthdays }` from the old keys (or null if none).
- `clearLegacyData()` removes the four legacy keys.
AuthProvider, after a successful login/register, calls `readLegacyData()`; if
non-empty, shows `Alert.alert` (web: `window.confirm`) with i18n text
`import.prompt`; Yes → `POST /import` then clear; No → clear. Then the task
hook reload picks up imported data.

## 8. Configuration & running locally

| Env (server/.env) | Default |
|---|---|
| `PORT` | `4000` |
| `DB_PATH` | `./data/app.db` (resolved relative to `server/`) |
| `CORS_ORIGIN` | `http://localhost:8081` |

| Env (app .env) | Example |
|---|---|
| `EXPO_PUBLIC_API_URL` | iOS sim / web: `http://localhost:4000`; Android emulator: `http://10.0.2.2:4000`; physical device: `http://<LAN-IP>:4000` |

Plain HTTP to a LAN IP may be blocked on iOS (ATS) / Android (cleartext) in
release builds; for Expo Go / dev builds it works. Production would put the
server behind HTTPS — out of scope.

Add a `.claude/launch.json` entry `api-server` (`npm --prefix server run dev`, port 4000).

## 9. Testing strategy

| Level | What | Where |
|---|---|---|
| Unit | password hash/verify, token hash, validators, migrations idempotent | `server/test/*.test.ts` |
| Integration | every endpoint incl. cross-user isolation (R4.2) | `server/test/api.test.ts` against `createApp(openDatabase(tmpFile))` |
| Durability | register + create task → close DB → reopen same file → login + data present; and spawn server as child process, `SIGKILL` it, restart, verify | `server/test/durability.test.ts` |
| App static | `npx tsc --noEmit`, `npm run lint` | root |
| Manual E2E | web via preview + iOS simulator: register, add task, restart server, reload app, still logged in and task present | checklist in tasks.md |

## 10. Rollback

All changes are on `feature/sqlite-migration`. Legacy AsyncStorage keys are
only deleted after the user answers the import prompt, so reverting the app
before that point loses nothing.

# Requirements — SQLite persistence migration

Status: **Draft — awaiting approval**
Notation: acceptance criteria use EARS phrasing
(*WHEN* <trigger> *THE SYSTEM SHALL* <response>). IDs are stable; never
renumber, only append.

## 1. Goal

Move user credentials and user data out of on-device AsyncStorage into a
SQLite database owned by a server process, so that:

- accounts work from any device/emulator/browser pointing at the same server;
- passwords are stored with a proper password-hashing function;
- data is isolated per user;
- data survives server shutdown, crash and restart because it lives in a
  file on disk that the next server run re-opens.

## 2. Glossary

| Term | Meaning |
|------|---------|
| Server | The new Node.js process in `server/`. |
| DB file | The SQLite database file, default `server/data/app.db`. |
| App | The existing Expo client (iOS, Android, web). |
| Session token | Opaque random string returned on login, sent as `Authorization: Bearer <token>`. |

## 3. Scope

**In scope:** users/credentials, sessions, tasks, birthdays; server; app
auth/task/birthday data layer; one-time import of existing local data.

**Out of scope (explicitly):** offline editing / sync queue, email
verification, password reset, multi-device real-time push, deployment to a
cloud host, the device-local preferences (`settings:locale`,
`settings:themeMode`, `settings:escalationDays` stay in AsyncStorage),
Supabase (removed).

## 4. User stories and acceptance criteria

### R1 — Credential storage

*As a user, I want my account stored securely on the server so I can log in
from any client.*

- **R1.1** WHEN a user registers THE SYSTEM SHALL store the account in the
  `users` table of the DB file, never in AsyncStorage.
- **R1.2** THE SYSTEM SHALL store passwords only as a salted **scrypt** hash
  (per-user random salt ≥ 16 bytes, parameters stored alongside the hash).
  Plaintext passwords SHALL never be written to disk or logs.
- **R1.3** THE SYSTEM SHALL normalise emails (trim + lowercase) and enforce
  uniqueness at the database level (unique index).
- **R1.4** WHEN a registration uses an already registered email THE SYSTEM
  SHALL reject it with error code `EMAIL_TAKEN`.
- **R1.5** WHEN email or password is empty THE SYSTEM SHALL reject with
  `ENTER_EMAIL_PASSWORD`.
- **R1.6** WHEN the password is shorter than **8** characters THE SYSTEM
  SHALL reject with `PASSWORD_TOO_SHORT` (raised from 4; UI strings updated
  in all locales).
- **R1.7** Password comparison SHALL be constant-time
  (`crypto.timingSafeEqual`).

### R2 — Sessions

- **R2.1** WHEN login or registration succeeds THE SYSTEM SHALL create a
  session row and return a random session token (≥ 32 bytes, base64url).
- **R2.2** THE SYSTEM SHALL store only the SHA-256 hash of the token in the
  DB, never the token itself.
- **R2.3** Sessions SHALL expire 30 days after creation; expired tokens
  return HTTP 401 `SESSION_EXPIRED`.
- **R2.4** WHEN the user logs out THE SYSTEM SHALL delete the session row.
- **R2.5** The App SHALL store the token in `expo-secure-store` on iOS/Android
  and in `localStorage` on web, and SHALL NOT store the email/password.
- **R2.6** WHEN the App starts with a stored token THE SYSTEM SHALL validate it
  via `GET /auth/me`; on 401 the App SHALL clear the token and show login.
- **R2.7** WHEN login fails THE SYSTEM SHALL return `USER_NOT_FOUND` or
  `WRONG_PASSWORD`, matching today's error codes and i18n keys.

### R3 — Durability (server restart must not lose data)

- **R3.1** THE SYSTEM SHALL persist all data in a single SQLite file whose
  path comes from env `DB_PATH` (default `server/data/app.db`).
- **R3.2** WHEN the server starts and the DB file exists THE SYSTEM SHALL
  open the existing file and SHALL NOT drop or recreate tables.
- **R3.3** WHEN the server starts and the DB file (or its directory) does
  not exist THE SYSTEM SHALL create it and apply the schema.
- **R3.4** Schema changes SHALL be applied by idempotent, versioned
  migrations tracked with `PRAGMA user_version`.
- **R3.5** THE SYSTEM SHALL open the DB with `journal_mode=WAL`,
  `synchronous=FULL`, `foreign_keys=ON`, `busy_timeout=5000`, so a committed
  write survives a process crash or `kill -9`.
- **R3.6** WHEN the server receives SIGINT or SIGTERM THE SYSTEM SHALL stop
  accepting requests, close the DB cleanly (WAL checkpoint) and exit 0.
- **R3.7** The DB file and its `-wal`/`-shm` companions SHALL be git-ignored.
- **R3.8** Every write request SHALL be committed before the HTTP response is
  sent (no in-memory write buffering).

### R4 — Tasks

- **R4.1** THE SYSTEM SHALL store tasks in a `tasks` table with every field
  of the current `Task` type (`src/types/task.ts`) plus `user_id`.
- **R4.2** A user SHALL only be able to list, create, update, toggle or delete
  their own tasks; accessing another user's task id returns 404.
- **R4.3** The App's `useTasks()` public API (`tasks, isLoaded, addTask,
  updateTask, toggleTask, deleteTask`) SHALL keep the same signature so
  screens need no changes.
- **R4.4** Mutations SHALL be optimistic in the UI and rolled back (with a
  visible error) if the server request fails.
- **R4.5** Server-side validation SHALL mirror the client types (quadrant and
  tag enums, `YYYY-MM-DD` dates, `HH:mm` times, non-empty trimmed title).

### R5 — Birthdays

- **R5.1** Same as R4.1–R4.4 for `birthdays` (`useBirthdays()` keeps
  `birthdays, isLoaded, addBirthday, deleteBirthday`).

### R6 — Data migration from AsyncStorage

- **R6.1** WHEN a user logs in on a device that still has
  `task-manager:tasks:v3` or `task-manager:birthdays:v1` data THE APP SHALL
  offer (confirm dialog) to import it into the logged-in account via
  `POST /import`.
- **R6.2** Import SHALL be idempotent (client ids are kept as-is; duplicates
  by id are skipped).
- **R6.3** After a successful import or an explicit "No" THE APP SHALL delete
  the legacy keys `task-manager:tasks:v3`, `task-manager:birthdays:v1`,
  `auth:users`, `auth:session`.
- **R6.4** Legacy local accounts are **not** migrated (SHA-256 hashes are not
  re-usable); users register again on the server.

### R7 — Connectivity and configuration

- **R7.1** The App SHALL read the server URL from `EXPO_PUBLIC_API_URL`
  and fail fast with a clear message if it is missing.
- **R7.2** WHEN the server is unreachable THE APP SHALL show a localized
  `SERVER_UNREACHABLE` error instead of crashing or hanging (request timeout
  10 s).
- **R7.3** The server SHALL listen on env `PORT` (default `4000`) and allow
  CORS for the Expo web dev origin.

### R8 — Cleanup

- **R8.1** `src/lib/supabase.ts`, `@supabase/supabase-js`,
  `react-native-url-polyfill` (if unused elsewhere) and the Supabase env vars
  SHALL be removed.
- **R8.2** `expo-crypto` SHALL be removed from the app if no longer used.

## 5. Non-functional requirements

- **N1** Server has automated tests (Node's built-in `node:test`) covering
  every R1–R6 criterion that is server-side, including a restart-durability
  test.
- **N2** `npm run lint` and `npx tsc --noEmit` pass in the app; server tests
  pass with `npm test` in `server/`.
- **N3** No new native modules in the app other than `expo-secure-store`.
- **N4** README documents how to start server + app on simulator, emulator,
  physical device and web.

## 6. Open questions (defaults chosen — change before implementation if needed)

| # | Question | Default |
|---|----------|---------|
| Q1 | Minimum password length? | 8 |
| Q2 | Session lifetime? | 30 days, no sliding refresh |
| Q3 | Keep preferences local or move to DB? | Local |
| Q4 | SQLite driver: built-in `node:sqlite` vs `better-sqlite3`? | `node:sqlite` (Node ≥ 22.13, no native build; project machine runs Node 24) |

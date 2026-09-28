# Task Manager Mobile

An Eisenhower-matrix task manager with birthdays, built with
[Expo](https://expo.dev) (iOS, Android, web). Accounts, tasks and birthdays
are stored on a small Node.js server in a SQLite database file, so the same
account works from any device that points at that server.

## Architecture

```
Expo app (src/)                         API server (server/)
  AuthProvider ─┐                          Express 5 routes
  useTasks ─────┼─ src/lib/api.ts  ──HTTP──▶  → repos → node:sqlite
  useBirthdays ─┘  Bearer <token>              │
  token: SecureStore (native)                  ▼
         localStorage (web)              server/data/app.db (+ -wal, -shm)
```

- **App** — Expo Router screens in `src/app`. It only keeps the session
  token and local preferences (language, theme, escalation days) on the
  device. All other data comes from the API.
- **Server** (`server/`) — a separate npm package, not bundled by Metro.
  Passwords are hashed with scrypt, and only a SHA-256 hash of each
  session token is stored. Every query is scoped to the signed-in user.
- **Database** — one SQLite file opened in WAL mode with
  `synchronous=FULL`. Every write is committed before the response is
  sent, so stopping, crashing or `kill -9`-ing the server loses nothing.
  The next start re-opens the same file. Schema changes are versioned
  migrations tracked with `PRAGMA user_version`.
- **Legacy data** — if the device still has tasks or birthdays from an
  older on-device-only version, the app offers to import them into the
  account after sign-in.

The full spec (requirements, design and API contract) is in
[`specs/sqlite-migration/`](specs/sqlite-migration/README.md).

## Prerequisites

- **Node.js ≥ 22.13**. The server uses the built-in `node:sqlite` module,
  so no native build is needed. Check with `node -v`.
- For native targets: Xcode (iOS simulator), Android Studio (emulator), or
  [Expo Go](https://expo.dev/go) on a physical device.
- Optional: the `sqlite3` CLI, for inspecting and backing up the database
  (preinstalled on macOS).

## Setup

```bash
npm install
npm --prefix server install
cp .env.example .env
```

Optionally, `cp server/.env.example server/.env` to change the server
defaults:

| Server env (`server/.env`) | Default | Meaning |
|---|---|---|
| `PORT` | `4000` | Port the API listens on (all interfaces). |
| `DB_PATH` | `./data/app.db` | SQLite file. Relative paths are resolved against `server/`. |
| `CORS_ORIGIN` | `http://localhost:8081` | Allowed web origin(s), comma-separated. |

## Running

Start the server and the app in two terminals:

```bash
npm run server        # API on http://localhost:4000, DB path printed on start
npx expo start        # then press i (iOS), a (Android), w (web)
```

Check that the server is up with `curl http://localhost:4000/health`. It
should return `{"ok":true}`.

### Pointing the app at the server

The app reads the server URL from `EXPO_PUBLIC_API_URL` in the root `.env`.
The app refuses to start if it is missing. Pick the address the device can
reach:

| Target | `EXPO_PUBLIC_API_URL` |
|---|---|
| Web, iOS simulator | `http://localhost:4000` |
| Android emulator | `http://10.0.2.2:4000` |
| Physical device (Expo Go / dev build) | `http://<your computer's LAN IP>:4000`, same Wi-Fi network |

After changing `.env`, restart Expo with `npx expo start --clear`, because
`EXPO_PUBLIC_*` values are inlined at bundle time.

If you open the web app from another origin, for example
`http://<LAN-IP>:8081`, add that origin to `CORS_ORIGIN` in `server/.env`.
Native apps are not affected by CORS.

Plain HTTP to a LAN IP works in Expo Go and development builds. Release
builds block it (iOS ATS, Android cleartext policy), so a production
deployment needs HTTPS in front of the server.

## Data: where it lives, backup, reset

The database is `server/data/app.db` (or `DB_PATH`), plus the `app.db-wal`
and `app.db-shm` files while the server runs. These files are git-ignored.
The server prints the absolute path on start.

**Back up**

- With the server stopped (Ctrl-C shuts it down cleanly and checkpoints
  the WAL), copy the file:

  ```bash
  cp server/data/app.db app-backup.db
  ```

- While it is running, use SQLite's online backup:

  ```bash
  sqlite3 server/data/app.db ".backup app-backup.db"
  ```

  Don't copy `app.db` alone while the server runs, because recent writes
  may still be only in `app.db-wal`.

**Restore** — stop the server, delete `server/data/app.db*`, copy the
backup to `server/data/app.db`, then start the server.

**Reset** (deletes all accounts and data) — stop the server, then run:

```bash
rm server/data/app.db*
```

The next start creates an empty database. Signed-in clients will be
logged out, because their session tokens no longer exist.

## Tests and checks

```bash
npm run server:test   # server: unit, API and restart/crash durability tests (node:test)
npx tsc --noEmit      # app type check
npm run lint          # app lint
```

## Project layout

```
src/app/          screens (Expo Router)
src/context/      auth, tasks, locale, theme, escalation providers
src/hooks/        useTasks / useBirthdays (optimistic, backed by the API)
src/lib/          api client, token storage, legacy import
src/i18n/         translations (ru, en, es, fr, de, pt, zh)
server/src/       config, db (connection + migrations), auth, repos, routes
server/test/      node:test suites
server/data/      SQLite database (git-ignored)
specs/            spec-driven development documents
```

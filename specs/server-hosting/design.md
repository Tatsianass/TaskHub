# Design — Hosted SQLite API

Implements [requirements.md](requirements.md).
Task list: [the implementation plan](../../docs/superpowers/plans/2026-10-14-hosted-sqlite-server.md).

## 1. What is already true

```
Expo app (src/)                         API (server/)
  local mode (default)                    Express 5
    tasks/birthdays in AsyncStorage       users, sessions, tasks, birthdays
  server mode                             node:sqlite file
    HTTPS + Bearer token  ──────────────▶  DB_PATH
```

`src/lib/config.ts` sets `LOCAL_MODE` unless `EXPO_PUBLIC_STORAGE_MODE` is
the string `server`. `eas.json` sets that variable to `local` for store
builds. A local `npx expo start` does **not** read `eas.json`; it reads
the root `.env`. So the local client can move to server mode without
touching store builds.

`server/src/config.ts` already resolves an absolute `DB_PATH` to that
absolute path (`path.resolve` drops earlier segments when it sees an
absolute one). `loadConfig({ DB_PATH: '/var/lib/todo/app.db' })` is
already tested. Production sets `DB_PATH=/data/app.db`. No path-joining
change is required.

`server/src/index.ts` today calls `listen(port)` with no host. On Fly the
process must listen on `0.0.0.0`. This design adds a `host` field,
default `0.0.0.0`.

The database is already opened in WAL mode with `synchronous=FULL`, and
the process checkpoints on SIGTERM. That is what makes a restart safe.
The host's job is only to keep the file on a disk the next container
mounts again.

## 2. Runtime shape

```
phone / simulator / browser on the developer machine
        │  HTTPS  EXPO_PUBLIC_API_URL
        ▼
Fly proxy (certificate, force_https)
        │  HTTP to 0.0.0.0:8080
        ▼
one Machine, shared-cpu-1x, 256 MB, region fra
        │
        ▼
volume taskhub_data mounted at /data
        └── app.db  (+ app.db-wal, app.db-shm while running)
```

The container root filesystem holds Node and `dist/`. It is disposable.
`/data` is the only place that stores user accounts.

`fly deploy` builds a new image and replaces the Machine. With one volume
and `--ha=false`, Fly attaches that same volume to the new Machine.
Creating a second Machine, or a second volume, would either fail the
mount or boot an empty database. Both are forbidden.

## 3. Files this work adds or changes

| File | Responsibility |
|---|---|
| `server/src/config.ts` | Add `host`, default `0.0.0.0`. |
| `server/src/index.ts` | `listen(port, host)`. |
| `server/test/config.test.ts` | Assert the host default and an override. |
| `server/.env.example` | Document `HOST` and the production `DB_PATH`. |
| `server/Dockerfile` | Build TypeScript, run `node dist/index.js` on Node 22. |
| `server/docker-entrypoint.sh` | Create `/data`, give it to `node`, drop root. |
| `server/.dockerignore` | Keep `node_modules`, `dist`, `data`, `.env` out of the image. |
| `server/fly.toml` | One machine, volume, port 8080, no auto-stop, HTTPS. |
| `scripts/check-hosted-server.sh` | Register, write a task, print the token and task id for the restart check. |
| `.env.example` | Show the hosted URL and `EXPO_PUBLIC_STORAGE_MODE=server`. |
| `README.md` | How to run the local client against the hosted API. |

Unchanged on purpose: `eas.json`, the SQLite schema, the repos, the auth routes.

## 4. Fly configuration (normative)

App name: `taskhub-api`. Fly app names are global. If create fails because
the name is taken, use `taskhub-api-` plus the slug from `fly auth whoami`
(lowercase, only `a-z`, `0-9`, and `-`). Write that final name into
`server/fly.toml` and into the README URL before committing those files.

```toml
app = "taskhub-api"
primary_region = "fra"
kill_timeout = "15s"

[build]
  dockerfile = "Dockerfile"

[env]
  PORT = "8080"
  HOST = "0.0.0.0"
  DB_PATH = "/data/app.db"
  NODE_ENV = "production"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "off"
  auto_start_machines = true
  min_machines_running = 1

  [[http_service.checks]]
    grace_period = "20s"
    interval = "30s"
    method = "GET"
    timeout = "5s"
    path = "/health"

[[mounts]]
  source = "taskhub_data"
  destination = "/data"

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory = "256mb"
```

`CORS_ORIGIN` is a secret, not a line in this file, so a later web origin
can be added without editing the image:

```bash
fly secrets set CORS_ORIGIN="http://localhost:8081"
```

Deploy from `server/` so the Docker context is the API package only:

```bash
fly deploy --ha=false
```

## 5. Image

`node:22-bookworm-slim`. The server's `engines` field requires Node
`>=22.13` because it uses `node:sqlite`. The Dockerfile aborts the build
if the image is older than that.

Production command is `node dist/index.js` (`npm run build` then
`npm start`). `tsx` stays a dev dependency and is not in the final image.

## 6. What the operator must do by hand

Fly requires a logged-in account and a credit card before the first
Machine starts. The agent stops and asks the owner to run `fly auth login`
and to add a card if `fly auth whoami` or `fly apps create` fails for that
reason. The agent never invents a token and never commits one.

## 7. Later — PostgreSQL (do not build)

The switch stays behind one new environment variable.

- When `DATABASE_URL` is unset, `server/src/index.ts` keeps calling
  `openDatabase(config.dbPath)` exactly as today. Local `npm run server`
  and this Fly volume keep working.
- When `DATABASE_URL` is set, a new `server/src/db/postgres.ts` opens that
  URL. The repos in `server/src/repos/` are the only modules that should
  learn the new driver. Routes stay as they are.
- Create the database with Fly Managed Postgres in the same org and the
  same region (`fly mpg create`). Put the URL in a secret named
  `DATABASE_URL`. Do not put it in `fly.toml`.
- Copy rows in this order: `users`, `sessions`, `tasks`, `birthdays`.
  Refuse the cutover if counts differ.
- Only then remove the volume. Until that check passes, `/data/app.db`
  remains the source of truth.
- Expected extra cost starts at Fly's Managed Postgres plan plus
  `$0.28/GB/month` of storage (price page checked 2026-10-14). The
  Machine bill does not have to change.

No repository in this codebase talks to PostgreSQL today. Adding the
driver is a later plan with its own tests.

## 8. Later — host the client (do not build)

The API URL stays `https://<app-name>.fly.dev`. The client is a second
deployment so the API Machine count stays 1.

**Web.** `app.json` has `web.output` set to `"single"`. A later plan runs
`npx expo export --platform web` with both public variables set to server
mode and the API URL. The export is a static site. Put it on Cloudflare
Pages (free tier is enough for a static export) or on a second Fly app
that has **no volume**. Add that site's origin to the `CORS_ORIGIN`
secret and restart the API Machine so the secret is picked up.

**iOS and Android.** A later plan changes only the `production` profile
in `eas.json`:

```json
"env": {
  "EXPO_PUBLIC_STORAGE_MODE": "server",
  "EXPO_PUBLIC_API_URL": "https://<app-name>.fly.dev"
}
```

`development` and `preview` stay `local` until the owner asks otherwise.
`submit.production` is empty. That later plan has to stop and ask the
owner for the Apple and Google accounts. It does not invent them.

**Phone data already in local mode** will not appear in the new account.
A later plan that wants that migration has to read
`taskhub:local:tasks` and `taskhub:local:birthdays` on the device and
send them to `POST /import`. The import route already accepts
`{ tasks, birthdays }` for one signed-in user.

**Preferences** (language, theme, escalation days) stay on the device.
They are not part of hosting.

# Hosted SQLite API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the existing TaskHub API on Fly.io so its SQLite file survives restarts and releases, and a locally started Expo app can register and store data there.

**Architecture:** One always-on Fly Machine (256 MB, Frankfurt) serves the existing Express API over HTTPS. A 1 GB Fly Volume mounted at `/data` holds `app.db`. The container root disk is disposable and is replaced on every `fly deploy`. The Expo app stays on the developer machine; only its gitignored `.env` switches it from local mode to this API. Store builds stay in local mode.

**Tech Stack:** Existing `server/` (Node.js ≥ 22.13, Express 5, `node:sqlite`), Docker image `node:22-bookworm-slim`, Fly.io Machines + Volumes, Expo SDK 57 reading `EXPO_PUBLIC_STORAGE_MODE` and `EXPO_PUBLIC_API_URL`.

## Global Constraints

- Node.js on the server is `>=22.13` (`server/package.json` `engines`). The image must be at least that, because the server uses `node:sqlite`.
- One Machine, one volume, `fly deploy --ha=false`. Never `fly scale count` above 1.
- `auto_stop_machines = "off"`, `min_machines_running = 1`, `kill_timeout = "15s"`.
- Database path in production is the absolute path `/data/app.db`.
- Do not commit `server/data/*.db*`, root `.env`, `server/.env`, or any Fly token.
- Do not edit `eas.json`. All three profiles stay `EXPO_PUBLIC_STORAGE_MODE=local`.
- Do not add PostgreSQL, a public web host, or store submission. Those are specified in `specs/server-hosting/design.md` sections 7 and 8 and are not tasks below.
- Do not change the SQLite schema, password hashing, or route shapes.
- Commit messages use Conventional Commits (`feat`, `docs`, `chore`).
- Prices below were read on 2026-10-14 from Fly's pricing page and Hetzner's price-adjustment page. If Fly's signup or card step blocks you, stop and ask the owner. Do not pick a different host.

---

## File structure

| File | What the implementer does |
|---|---|
| `server/src/config.ts` | Add `host` to `Config`. Default `0.0.0.0`. |
| `server/src/index.ts` | Pass `config.host` to `listen`. |
| `server/test/config.test.ts` | Update the default deep-equal and cover `HOST`. |
| `server/.env.example` | Document `HOST` and the hosted `DB_PATH`. |
| `server/Dockerfile` | Multi-stage build. Final process is `node dist/index.js`. |
| `server/docker-entrypoint.sh` | Own `/data` as `node`, then drop root. |
| `server/.dockerignore` | Exclude local database, env, and build junk. |
| `server/fly.toml` | The normative config from the design. |
| `scripts/check-hosted-server.sh` | Create one user and one task against a base URL. |
| `.env.example` | Document server mode and the Fly URL. |
| `README.md` | A "Hosted API" section for the local client. |

Spec (already written, do not rewrite): `specs/server-hosting/`.

---

### Task 1: Listen on all interfaces

**Files:**
- Modify: `server/src/config.ts`
- Modify: `server/src/index.ts`
- Modify: `server/test/config.test.ts`
- Modify: `server/.env.example`
- Test: `server/test/config.test.ts`

**Interfaces:**
- Consumes: `loadConfig(env)` already returns `{ port, dbPath, corsOrigins }`.
- Produces: `Config.host: string`. `loadConfig` returns `host`. Empty or missing `HOST` yields `0.0.0.0`. `index.ts` calls `listen(config.port, config.host, callback)`.

- [x] **Step 1: Update the default assertion so it fails until `host` exists**

In `server/test/config.test.ts`, replace the `defaults` test body with:

```ts
  test('defaults', () => {
    assert.deepEqual(loadConfig({}), {
      port: 4000,
      host: '0.0.0.0',
      dbPath: join(SERVER_DIR, 'data', 'app.db'),
      corsOrigins: ['http://localhost:8081'],
    });
  });
```

Replace the `blank values fall back to defaults` test body with:

```ts
  test('blank values fall back to defaults', () => {
    const config = loadConfig({ PORT: ' ', HOST: ' ', DB_PATH: '', CORS_ORIGIN: ' , ' });
    assert.equal(config.port, 4000);
    assert.equal(config.host, '0.0.0.0');
    assert.equal(config.dbPath, join(SERVER_DIR, 'data', 'app.db'));
    assert.deepEqual(config.corsOrigins, ['http://localhost:8081']);
  });
```

Add this test after the `overrides` test. Leave the `overrides` test as it is; it asserts fields one by one and does not read `host`.

```ts
  test('HOST override is trimmed', () => {
    assert.equal(loadConfig({ HOST: ' 127.0.0.1 ' }).host, '127.0.0.1');
  });
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npm --prefix server test -- test/config.test.ts`

Expected: FAIL. `loadConfig({}).host` is `undefined` (the returned object has no `host`).

- [x] **Step 3: Add `host` to config and bind it**

In `server/src/config.ts`, change the type and the loader:

```ts
export type Config = {
  port: number;
  /** Interface to bind. `0.0.0.0` accepts connections from outside the container. */
  host: string;
  /** Absolute path to the SQLite DB file. */
  dbPath: string;
  corsOrigins: string[];
};

export const DEFAULT_PORT = 4000;
export const DEFAULT_HOST = '0.0.0.0';
export const DEFAULT_DB_PATH = 'data/app.db';
export const DEFAULT_CORS_ORIGIN = 'http://localhost:8081';
```

Inside `loadConfig`, return `host` next to `port`:

```ts
  return {
    port: parsePort(env.PORT),
    host: parseHost(env.HOST),
    dbPath: resolve(SERVER_DIR, env.DB_PATH?.trim() || DEFAULT_DB_PATH),
    corsOrigins: parseOrigins(env.CORS_ORIGIN),
  };
```

Add this function next to `parsePort`:

```ts
function parseHost(value: string | undefined) {
  const host = value?.trim() ?? '';
  return host === '' ? DEFAULT_HOST : host;
}
```

In `server/src/index.ts`, change the `listen` call to:

```ts
const server = createApp(db, { corsOrigins: config.corsOrigins }).listen(
  config.port,
  config.host,
  (error) => {
    if (error) {
      console.error(`[server] failed to listen on ${config.host}:${config.port}: ${error.message}`);
      closeDatabase(db);
      process.exit(1);
    }
    const { port } = server.address() as AddressInfo;
    console.log(`[server] listening on http://${config.host}:${port}`);
  },
);
```

Append these lines to `server/.env.example`:

```
# Interface to bind. 0.0.0.0 is required in a container. Default is 0.0.0.0.
HOST=0.0.0.0

# On Fly the database lives on the volume, not in the image:
# DB_PATH=/data/app.db
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npm --prefix server test`

Expected: all server tests PASS, including the new host assertions. The rest of the suite must stay green because `listen` is not imported by the tests.

- [x] **Step 5: Commit**

```bash
git add server/src/config.ts server/src/index.ts server/test/config.test.ts server/.env.example
git commit -m "$(cat <<'EOF'
feat: bind the API on all interfaces

Fly reaches the process through the container network, so the default listen address is 0.0.0.0.

EOF
)"
```

---

### Task 2: Image that keeps the database directory writable

**Files:**
- Create: `server/Dockerfile`
- Create: `server/docker-entrypoint.sh`
- Create: `server/.dockerignore`

**Interfaces:**
- Consumes: `npm run build` writes `server/dist/`, `npm start` runs `node dist/index.js`, `Config.host` from Task 1.
- Produces: an image whose process is `node dist/index.js` running as user `node`, with `/data` owned by that user. No database file is baked into the image.

- [x] **Step 1: Add the ignore file and the entrypoint**

Create `server/.dockerignore`:

```
node_modules
dist
data
.env
test
*.md
```

Create `server/docker-entrypoint.sh`:

```sh
#!/bin/sh
# The volume is root-owned when Fly mounts it. Own it, then drop root.
set -eu
mkdir -p /data
chown node:node /data
exec runuser -u node -- node /app/dist/index.js
```

- [x] **Step 2: Add the Dockerfile**

Create `server/Dockerfile`:

```dockerfile
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN node -e "const [maj,min]=process.versions.node.split('.').map(Number); if (maj<22 || (maj===22 && min<13)) { console.error('node:sqlite needs >=22.13, got '+process.versions.node); process.exit(1); }"
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
EXPOSE 8080
ENTRYPOINT ["docker-entrypoint.sh"]
```

- [x] **Step 3: Build the image**

Run from the repository root:

```bash
docker build -t taskhub-api:local server
```

Expected: the build finishes and prints `naming to docker.io/library/taskhub-api:local` (wording varies). The Node version check does not print an error.

If `docker` is not installed, stop and ask the owner to install Docker Desktop or to confirm that `fly deploy` (Task 4) may be the first build. Do not skip the file contents above.

- [x] **Step 4: Confirm the image does not contain a database**

```bash
docker run --rm --entrypoint sh taskhub-api:local -c "ls /data; ls /app/dist/index.js"
```

Expected: `/data` is empty (the directory exists because of `mkdir` only when the entrypoint runs; this command uses `sh` and bypasses the entrypoint, so `/data` may be missing). `/app/dist/index.js` is listed. There is no `/app/data/app.db` and no `/data/app.db`.

A missing `/data` in this probe is acceptable. An `app.db` inside the image is not. If you see one, the `.dockerignore` or the `COPY` lines are wrong. Fix them before continuing.

- [x] **Step 5: Commit**

```bash
git add server/Dockerfile server/docker-entrypoint.sh server/.dockerignore
git commit -m "$(cat <<'EOF'
feat: package the API as a single-process image

The image ships compiled JavaScript only. The database directory is created at start and is not copied in.

EOF
)"
```

---

### Task 3: Fly app definition

**Files:**
- Create: `server/fly.toml`

**Interfaces:**
- Consumes: the image from Task 2, `PORT`, `HOST`, and `DB_PATH` read by `loadConfig`.
- Produces: `server/fly.toml` with `app = "taskhub-api"`, volume source `taskhub_data`, destination `/data`, internal port 8080. Deploy still happens in Task 4.

- [x] **Step 1: Write `server/fly.toml`**

```toml
# One Machine. SQLite on this API has a single writer.
# Deploy only with: fly deploy --ha=false
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

Do not put `CORS_ORIGIN` in this file. Task 4 sets it as a secret.

- [x] **Step 2: Reject a second machine in review**

Open `server/fly.toml` and check, before committing:

- `auto_stop_machines` is `"off"`.
- `min_machines_running` is `1`.
- `memory` is `"256mb"`.
- There is no `[[services]]` block and no second `[[mounts]]` entry.
- There is no dedicated IP line.

- [x] **Step 3: Commit**

```bash
git add server/fly.toml
git commit -m "$(cat <<'EOF'
feat: define the single-machine Fly app

The volume at /data is the only durable disk. The machine stays up so the local client is not waiting on a cold start.

EOF
)"
```

---

### Task 4: Create the app, the volume, and the first release

**Files:**
- Modify: `server/fly.toml` only if the app name `taskhub-api` is already taken.

**Interfaces:**
- Consumes: `server/fly.toml` from Task 3.
- Produces: a public `https://<app>.fly.dev` whose `/health` returns `{"ok":true}`, one volume named `taskhub_data` mounted on one started Machine. The implementer records `<app>` and the volume id in the commit body.

This task needs the owner's Fly account. It does not need a custom domain.

Every `fly` command in this task and in Task 5 starts with `cd "$(git rev-parse --show-toplevel)/server"` so Fly reads `server/fly.toml`. The Docker build context is that directory. Do not run `fly deploy` from the repository root.

- [ ] **Step 1: Install and log in**

```bash
brew install flyctl
fly auth whoami
```

Expected: a user email or org name.

If `fly auth whoami` says you are not logged in, stop and ask the owner to run `fly auth login` and to add a credit card on https://fly.io/dashboard . Do not continue, and do not store a token in the repo. Fly charges this app about $2.10 to $2.70 per month at 2026-10-14 prices (256 MB Machine plus a 1 GB volume). Say that number when you ask.

- [ ] **Step 2: Create the app**

```bash
cd "$(git rev-parse --show-toplevel)/server"
fly apps create taskhub-api
```

Expected: `New app created: taskhub-api`.

If Fly answers that the name is taken:

```bash
fly auth whoami
```

Take the part before `@` if it printed an email, lowercase it, and delete every character that is not `a-z`, `0-9`, or `-`. If that slug is empty, use `owner`. Then:

```bash
cd "$(git rev-parse --show-toplevel)/server"
fly apps create taskhub-api-SLUG
```

Set `app = "taskhub-api-SLUG"` in `server/fly.toml` to that exact name. Every later command uses that name. Call it `APP` below.

If `fra` is rejected for capacity when you create the volume in the next step, set `primary_region = "ams"` in `server/fly.toml` and create the volume in `ams` instead. Do not leave the file and the volume in different regions.

- [ ] **Step 3: Create the 1 GB volume**

```bash
cd "$(git rev-parse --show-toplevel)/server"
fly volumes create taskhub_data --region fra --size 1 --yes
```

Use `ams` instead of `fra` only in the case from Step 2.

Expected: a volume id starting with `vol_` and region `fra` (or `ams`). Copy the id. Size is 1 GB. That is $0.15 per month. Do not create a second volume.

- [ ] **Step 4: Set the web origin and deploy once**

```bash
cd "$(git rev-parse --show-toplevel)/server"
fly secrets set CORS_ORIGIN="http://localhost:8081"
fly deploy --ha=false
```

Expected: one Machine in the same region as the volume, health check passing, a line with `https://APP.fly.dev`.

`--ha=false` is required. Without it Fly may try to start a second Machine, which cannot mount the only volume.

- [ ] **Step 5: Prove it is one machine and the health URL is HTTPS**

```bash
cd "$(git rev-parse --show-toplevel)/server"
fly status
fly scale show
curl -fsS "https://APP.fly.dev/health"
```

Expected:

- `fly status` lists exactly one started Machine.
- Memory is 256 MB. If `fly logs` shows `out of memory` or the Machine restarts more than twice in a minute, run `fly scale memory 512` from `server/` once and only then. Record that the bill is now about $3.35 to $4.00 per month.
- `curl` prints `{"ok":true}`.
- `curl -fsS "http://APP.fly.dev/health"` either redirects to HTTPS or fails. A plain HTTP 200 that does not redirect is a failure: confirm `force_https = true` in `server/fly.toml`, then from `server/` run `fly deploy --ha=false` again.

- [ ] **Step 6: Commit the name change, if any**

If `server/fly.toml` still says `taskhub-api` and that is the app you created, there is nothing to commit. Say so in the task note.

If you renamed the app or switched the region:

```bash
git add server/fly.toml
git commit -m "$(cat <<'EOF'
chore: record the Fly app name and region

The name or region Fly actually issued differed from the default, and the file has to match the running app.

EOF
)"
```

Put the app name, the volume id, and the health URL in the commit body. If there was no commit, write them in the PR or task note instead.

---

### Task 5: Prove the file survives a restart and a release

**Files:**
- Create: `scripts/check-hosted-server.sh`

**Interfaces:**
- Consumes: `POST /auth/register` body `{ "email", "password" }` returns `201` and `{ "token", "user" }`. `POST /tasks` with the task JSON below returns `201`. `GET /auth/me` and `GET /tasks` both require `Authorization: Bearer <token>`.
- Produces: `scripts/check-hosted-server.sh <base-url>` writes `/tmp/taskhub-hosted-check.env` containing `TOKEN` and `TASK_ID`, and exits 0 when both creates succeed.

- [ ] **Step 1: Add the check script**

Create `scripts/check-hosted-server.sh`:

```bash
#!/bin/sh
# Register one user and create one task on a hosted API.
# Usage: scripts/check-hosted-server.sh https://APP.fly.dev
set -eu
BASE="${1:?usage: scripts/check-hosted-server.sh https://APP.fly.dev}"
BASE="${BASE%/}"
STAMP="$(date +%s)"
EMAIL="durability-${STAMP}@example.com"
TASK_ID="host-check-${STAMP}"
BODY="$(mktemp)"
trap 'rm -f "$BODY"' EXIT

curl -fsS -o "$BODY" -X POST \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"durability-pass\"}" \
  "${BASE}/auth/register"

TOKEN="$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).token)" "$BODY")"
test -n "$TOKEN"

curl -fsS -o "$BODY" -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{\"id\":\"${TASK_ID}\",\"title\":\"Hosted durability check\",\"description\":\"\",\"quadrantId\":\"urgent-important\",\"tag\":null,\"done\":false,\"completedAt\":null,\"createdAt\":1,\"dueDate\":null,\"remindMe\":false,\"remindTime\":null,\"remindOffsets\":[]}" \
  "${BASE}/tasks"

node -e "
const fs = require('fs');
const task = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
if (task.id !== process.argv[2]) process.exit(1);
" "$BODY" "$TASK_ID"

umask 077
cat > /tmp/taskhub-hosted-check.env <<EOF
TOKEN=${TOKEN}
TASK_ID=${TASK_ID}
EMAIL=${EMAIL}
EOF
echo "created ${EMAIL} task ${TASK_ID}"
```

```bash
chmod +x scripts/check-hosted-server.sh
```

- [ ] **Step 2: Create the user and the task**

Replace `APP` with the name from Task 4.

```bash
scripts/check-hosted-server.sh "https://APP.fly.dev"
```

Expected: `created durability-<stamp>@example.com task host-check-<stamp>` and a file `/tmp/taskhub-hosted-check.env`. That file holds a live session token. Do not commit it. `/tmp` is outside the repo.

- [ ] **Step 3: Restart the Machine and read the same rows**

```bash
cd "$(git rev-parse --show-toplevel)/server"
fly machine restart "$(fly machines list --json | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const rows=JSON.parse(s); if(rows.length!==1) process.exit(1); process.stdout.write(rows[0].id)})")"
```

Wait until `curl -fsS "https://APP.fly.dev/health"` prints `{"ok":true}` again. Then:

```bash
set -a
. /tmp/taskhub-hosted-check.env
set +a
curl -fsS -H "Authorization: Bearer ${TOKEN}" "https://APP.fly.dev/auth/me"
curl -fsS -H "Authorization: Bearer ${TOKEN}" "https://APP.fly.dev/tasks"
```

Expected: `/auth/me` JSON contains `"email":"durability-<stamp>@example.com"`. `/tasks` JSON contains `"id":"host-check-<stamp>"` and `"title":"Hosted durability check"`. A 401 or an empty task list means the volume was not mounted. Stop. Do not register a second user to hide that.

- [ ] **Step 4: Deploy again and read the same rows**

Record the volume id, then release the same image again:

```bash
cd "$(git rev-parse --show-toplevel)/server"
fly volumes list
fly deploy --ha=false
fly volumes list
```

Expected: the same `vol_` id as Task 4, still one volume, still one Machine. Then repeat the two `curl` commands from Step 3 with the same `TOKEN`. The same email and the same task id come back.

If `fly volumes list` shows a second volume, destroy only that extra id, and only after `GET /tasks` succeeded against the original id from Task 4:

```bash
cd "$(git rev-parse --show-toplevel)/server"
fly volumes destroy EXTRA_VOL_ID --yes
```

`EXTRA_VOL_ID` is the id that was not in the Task 4 list. Never pass the original id to `fly volumes destroy`.

- [ ] **Step 5: Confirm snapshots are on**

```bash
cd "$(git rev-parse --show-toplevel)/server"
fly volumes snapshots list VOL_ID
```

`VOL_ID` is the id from `fly volumes list`. Expected: the command succeeds. An empty list is acceptable on the first day, because the daily snapshot may not have run yet. Fly turns that schedule on for a new volume (daily, kept 5 days). If the command says scheduled snapshots are disabled, turn them on and take one snapshot:

```bash
cd "$(git rev-parse --show-toplevel)/server"
fly volumes update VOL_ID --scheduled-snapshots=true
fly volumes snapshots create VOL_ID
```

Note in the commit body that the schedule was off and a manual snapshot was taken.

- [ ] **Step 6: Commit the script**

```bash
git add scripts/check-hosted-server.sh
git commit -m "$(cat <<'EOF'
test: check a hosted user survives restart and redeploy

The script creates one account and one task so the operator can prove the volume is the disk that came back.

EOF
)"
```

In the commit body, paste the app URL, the volume id, and the two words `restart ok` and `redeploy ok`. Do not paste the token.

---

### Task 6: Point the local client at the hosted API

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify locally, do not commit: `.env`

**Interfaces:**
- Consumes: `LOCAL_MODE` is true unless `EXPO_PUBLIC_STORAGE_MODE` is `server` (`src/lib/config.ts`). The hosted base URL from Task 4.
- Produces: a gitignored `.env` that makes `npx expo start` open the login screen and talk to `https://APP.fly.dev`. `eas.json` is not modified.

- [ ] **Step 1: Document the variables**

Replace the contents of `.env.example` with:

```
# Where data lives. Default (unset) = 'local': on the device, no server, no sign-in.
# 'server' sends accounts, tasks, and birthdays to EXPO_PUBLIC_API_URL.
# Store builds in eas.json stay on 'local' until a later plan hosts the client.
EXPO_PUBLIC_STORAGE_MODE=local

# Local API (only if you also run `npm run server` on this machine):
# EXPO_PUBLIC_API_URL=http://localhost:4000
#
# Hosted API (Fly volume, SQLite). Use this to exercise server mode
# without hosting the client. Replace APP with the name in server/fly.toml.
EXPO_PUBLIC_API_URL=https://taskhub-api.fly.dev
```

If Task 4 chose a different app name, put that name in the URL instead of `taskhub-api`.

- [ ] **Step 2: Document the local-client path in the README**

Insert this section in `README.md` immediately before the heading `## Tests and checks` (after the reset instructions, not in the middle of them):

```markdown
## Hosted API, local client

The API can run on Fly.io with the SQLite file on a volume. The Expo
client can stay on your machine and still use that API.

1. Leave `eas.json` alone. Its builds stay in local mode.
2. In the root `.env` (this file is gitignored), set `EXPO_PUBLIC_STORAGE_MODE=server` and `EXPO_PUBLIC_API_URL=https://taskhub-api.fly.dev`. Use the app name from `server/fly.toml` if it is not `taskhub-api`.
3. Restart the client so the public variables are inlined: `npx expo start --clear`.
4. The app opens on the login screen. Register there. That account is stored in `/data/app.db` on the Fly volume, not on the phone.
5. iOS Simulator, Android Emulator, and a phone on the same Wi-Fi all use that HTTPS URL. Do not use `http://` for the hosted API.

Deploying a new API release does not publish the client. Hosting the web export or the store apps is a later plan; the seams are in `specs/server-hosting/design.md`.
```

Replace `taskhub-api` in that inserted section when the real app name differs.

- [ ] **Step 3: Write the local `.env` and start the client**

Write the root `.env` (do not `git add` it):

```
EXPO_PUBLIC_STORAGE_MODE=server
EXPO_PUBLIC_API_URL=https://APP.fly.dev
```

`APP` is the name from Task 4. No trailing slash.

```bash
npx expo start --clear
```

Open the iOS simulator, the Android emulator, or the web target (`w`).

Expected:

- The first screen is login, not the task matrix. Local mode skips login; server mode must not.
- Register with a new email and a password of at least 8 characters.
- Create a task.
- `curl -fsS -H "Authorization: Bearer <token from the app or from a fresh login>" "https://APP.fly.dev/tasks"` includes that task's title.

A login screen that then shows `SERVER_UNREACHABLE` means the URL is wrong or the Machine is stopped. From `server/`, `fly status` must show one started Machine.

- [ ] **Step 4: Confirm store config was not switched**

```bash
git diff eas.json
```

Expected: no diff. If `eas.json` changed, revert it.

```bash
git status --short
```

Expected: `.env` is absent from the list (it is gitignored). `server/data/` database files are absent too.

- [ ] **Step 5: Commit the docs only**

```bash
git add .env.example README.md
git commit -m "$(cat <<'EOF'
docs: point the local client at the hosted API

Server mode is a local .env switch. Store builds stay on device storage until the client itself is hosted.

EOF
)"
```

---

## Acceptance (all must be true)

| # | Check | Requirement |
|---|---|---|
| 1 | `curl -fsS https://APP.fly.dev/health` prints `{"ok":true}` | H4.3 |
| 2 | `fly status` shows exactly one started Machine, auto-stop off | H2.1, H2.2 |
| 3 | `fly volumes list` shows one `taskhub_data` volume mounted at `/data` | H3.1, H3.2 |
| 4 | After `fly machine restart`, the same token still returns the same user and task | H5.1 |
| 5 | After a second `fly deploy --ha=false`, the volume id is unchanged and the same token still returns that task | H6.1, H6.2 |
| 6 | Snapshots are enabled, or one manual snapshot was created and noted | H7.1 |
| 7 | `npx expo start --clear` with the gitignored `.env` opens login and a registered account exists on the hosted API | H8.1, H8.2 |
| 8 | `eas.json` still has `"EXPO_PUBLIC_STORAGE_MODE": "local"` in development, preview, and production | H8.3 |
| 9 | No `.env`, database file, or Fly token is in `git status` | H3.4 |

## Later (do not execute)

PostgreSQL and hosting the client are specified in `specs/server-hosting/design.md` sections 7 and 8. Starting either one inside this plan fails the acceptance above, because this plan's client stays local and its database stays the SQLite file on the volume.

## Traceability

| Requirement | Task |
|---|---|
| H1.1–H1.5 host and size | Task 4 |
| H2.1–H2.3 one machine, no sleep, kill timeout | Task 3, Task 4 |
| H3.1–H3.4 volume path and entrypoint | Task 2, Task 3, Task 4 |
| H4.1–H4.4 bind, HTTPS, health, CORS | Task 1, Task 3, Task 4 |
| H5.1 restart | Task 5 |
| H6.1–H6.2 redeploy | Task 5 |
| H7.1 snapshots | Task 5 |
| H8.1–H8.4 local client, eas.json untouched, docs | Task 6 |
| L1, L2 later seams | Already written in `specs/server-hosting/design.md`. No task. |

# Requirements — Hosted SQLite API

Status: **Approved for planning** (no application code in this change)
Notation: acceptance criteria use EARS phrasing
(*WHEN* <trigger> *THE SYSTEM SHALL* <response>).

Checked against public prices on **2026-10-14**.

## 1. Goal

Run the existing `server/` API on a public HTTPS address, with its SQLite
file on a disk that survives process restarts and new releases, so a
developer can run the Expo client on their own machine and use that
hosted API.

## 2. In scope

- Choose and document the host.
- Package the existing API so that host can run it.
- One always-on machine, one persistent volume, the existing SQLite file on that volume.
- Prove a user and a task are still there after a restart and after a second deploy.
- Tell the local client to use server mode against that HTTPS address.
- Write down, without building them, the seams for PostgreSQL and for hosting the client later.

## 3. Out of scope

- Building or publishing the web app, the iOS app, or the Android app.
- Changing `eas.json` (all three profiles stay `EXPO_PUBLIC_STORAGE_MODE=local`).
- Implementing PostgreSQL, password reset, email verification, or request rate limits.
- Moving tasks off the server while leaving only users in the database. Server mode already stores users, sessions, tasks, and birthdays together.
- Importing data that the current local mode keeps on the phone (`taskhub:local:tasks`, `taskhub:local:birthdays`). The existing import only reads the older keys `task-manager:tasks:v3` and `task-manager:birthdays:v1`.

## 4. Host

### H1 — Cheapest host that fits

*As the owner, I want the smallest bill that still keeps one SQLite file safe across restarts and releases, and that can gain PostgreSQL later without moving the API to a new kind of platform.*

- **H1.1** THE SYSTEM SHALL run on **Fly.io**: one `shared-cpu-1x` Machine with **256 MB** RAM in region **`fra`** (Frankfurt), plus a **1 GB** Fly Volume.
- **H1.2** THE SYSTEM SHALL use the included shared IPv4 and the hostname `https://<app-name>.fly.dev`. THE SYSTEM SHALL NOT allocate a dedicated IPv4.
- **H1.3** Expected bill at prices published on 2026-10-14: about **$2.10 to $2.70 per month** (Machine about $1.94 to $2.53 by region, plus $0.15 for 1 GB). The first 10 single-hostname certificates are free. A dedicated IPv4 is $2/month and is not used.
- **H1.4** WHEN the Machine logs an out-of-memory kill or a restart loop on boot THE OPERATOR SHALL raise memory to 512 MB with `fly scale memory 512` and record the new bill (about $3.35 to $4.00). No other size change is allowed in this work.
- **H1.5** WHEN `fra` has no capacity THE OPERATOR SHALL use `ams` for both `primary_region` and the volume. Both must be the same region.

Why not the other cheap options (decision record, not a second implementation):

| Option | Why it lost |
|---|---|
| Hetzner CX23 | About €5.49/month before IPv4, plus €0.50 for IPv4, and the plan was marked unavailable on 2026-10-14. Also needs a hand-built HTTPS proxy and OS updates. |
| Hetzner CAX11 | About €5.99/month. More money and more operations than this API needs. |
| Railway Free | $1/month of usage. A 256 MB process left on is about $2.50 of RAM alone, so it cannot stay up all month. |
| Railway Hobby | $5/month floor, above Fly for this size. |
| Render free | Disk is erased on restart. Paid web service starts near $7/month. |

Fly Managed Postgres exists in the same organization. A later plan can add it and leave this Machine in place. That is the PostgreSQL path. It is not built here.

## 5. Process and disk

### H2 — One always-on process

- **H2.1** THE API SHALL run as exactly one Machine. `fly scale count` SHALL stay 1. Deploys SHALL use `fly deploy --ha=false`.
- **H2.2** `auto_stop_machines` SHALL be `"off"` and `min_machines_running` SHALL be 1. The API must answer without waiting for a cold start.
- **H2.3** `kill_timeout` SHALL be `15s`, so the existing SIGTERM handler can checkpoint SQLite before the process is killed.

### H3 — SQLite file on the volume

- **H3.1** THE API SHALL open the database at the absolute path `/data/app.db`.
- **H3.2** `/data` SHALL be a Fly Volume named `taskhub_data`. It SHALL NOT be the container's root disk. Fly erases the root disk on every deploy.
- **H3.3** WHEN the process starts as root THE ENTRYPOINT SHALL `chown` `/data` to the `node` user and then drop to that user before `node dist/index.js`.
- **H3.4** WAL companions (`app.db-wal`, `app.db-shm`) stay in `/data` next to `app.db`. No task may copy the database into the image.

### H4 — Reachable address

- **H4.1** THE API SHALL listen on `0.0.0.0` and on the port in `PORT` (set to `8080` in `fly.toml`).
- **H4.2** Fly SHALL terminate HTTPS. `force_https` SHALL be true. A phone or simulator talking to this host over plain HTTP is not acceptable: iOS blocks cleartext to non-local hosts.
- **H4.3** `GET /health` SHALL return HTTP 200 and `{"ok":true}` on `https://<app-name>.fly.dev/health`.
- **H4.4** `CORS_ORIGIN` SHALL include `http://localhost:8081` so the local web client can call the API. Native iOS and Android clients do not use CORS.

## 6. Durability acceptance

### H5 — Restart

- **H5.1** WHEN a user has registered and a task has been created, AND the Machine is then restarted, THE API SHALL still return that user from `GET /auth/me` and that task from `GET /tasks` using the same session token.

### H6 — Release

- **H6.1** WHEN a second `fly deploy --ha=false` finishes (a release that replaces the container), THE API SHALL still return that same user and that same task.
- **H6.2** The volume id SHALL be the same before and after that second deploy. A new empty volume is a failure.

### H7 — Snapshots

- **H7.1** THE VOLUME SHALL keep Fly's default automatic daily snapshots (5-day retention). The operator confirms they are listed. The first 10 GB of snapshots are free; this database will stay far under that.

## 7. Local client

### H8 — Server mode against the hosted API

- **H8.1** WHEN the developer sets `EXPO_PUBLIC_STORAGE_MODE=server` and `EXPO_PUBLIC_API_URL=https://<app-name>.fly.dev` in the gitignored root `.env`, AND starts Expo with `npx expo start --clear`, THE APP SHALL show the login screen instead of opening straight into the task matrix.
- **H8.2** WHEN the developer registers on that screen, THE ACCOUNT SHALL be the same account `GET /auth/me` returns from the hosted API.
- **H8.3** `eas.json` SHALL stay `EXPO_PUBLIC_STORAGE_MODE=local` on `development`, `preview`, and `production`.
- **H8.4** `.env.example` and `README.md` SHALL document the two variables and the hosted URL. The real `.env` file stays uncommitted.

## 8. Later, not in this acceptance

These are written in [design.md](design.md) so the next plan has a place to start. No task in the implementation plan builds them.

### L1 — PostgreSQL

A later plan may add Fly Managed Postgres and a second database driver behind the existing repos. SQLite remains the default when `DATABASE_URL` is unset. The volume stays until a row-count check matches, then it can be deleted.

### L2 — Host the client

A later plan may publish the web export and point EAS production builds at the same API URL. That plan is the one that changes `eas.json` and adds the public web origin to `CORS_ORIGIN`.

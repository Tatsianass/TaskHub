# Spec: Host the API on a persistent disk

Branch: `undochlorine/MD`.

The phone app and the API already share this repository. The API
(`server/`) stores users, sessions, tasks, and birthdays in one SQLite
file. Today the app defaults to **local mode**: that file is never used,
and nothing is hosted.

This package says how to put that API on the internet so a **locally run
client** can register, sign in, and keep data across server restarts and
new releases. Publishing the client (web, App Store, Google Play) is
described so a later plan can start from it. It is not part of the work
below.

## Documents

| # | File | Purpose |
|---|------|---------|
| 1 | [requirements.md](requirements.md) | What must be true when this work is done, and what is deliberately left for later. |
| 2 | [design.md](design.md) | Which host, why, how the disk survives a release, and the seams for Postgres and for hosting the client. |
| 3 | [../../docs/superpowers/plans/2026-10-14-hosted-sqlite-server.md](../../docs/superpowers/plans/2026-10-14-hosted-sqlite-server.md) | Step-by-step implementation plan. An agent executes this file, not this README. |

## Rules for the implementing agent

1. Read `requirements.md`, `design.md`, and the plan before editing anything else.
2. Execute only the numbered tasks in the plan. Do not start the "Later" sections.
3. Do not commit `server/data/*.db*`, `.env`, `server/.env`, or any Fly token.
4. Leave `eas.json` on `EXPO_PUBLIC_STORAGE_MODE=local`. Store builds stay on-device until a later plan.
5. One API machine. SQLite in this project is a single file with one writer.

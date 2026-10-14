#!/bin/sh
# The volume is root-owned when Fly mounts it. Own it, then drop root.
set -eu
mkdir -p /data
chown node:node /data
exec runuser -u node -- node /app/dist/index.js

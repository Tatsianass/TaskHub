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
cat > /tmp/taskhub-hosted-check.env <<EOT
TOKEN=${TOKEN}
TASK_ID=${TASK_ID}
EMAIL=${EMAIL}
EOT
echo "created ${EMAIL} task ${TASK_ID}"

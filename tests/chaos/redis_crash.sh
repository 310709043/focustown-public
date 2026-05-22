#!/usr/bin/env bash
# Phase 10 chaos drill — Redis crash mid-queue.
#
# Verifies Phase 06's match_waiting_pool durability guarantee: when Redis
# dies mid-wait, the source-of-truth PG row survives, and the
# matching_queue_reconciler (every 30s) replays the missing waiters back
# into Redis on the next tick after Redis recovers.
#
# Drill outline:
#   1) Auth N test users via the seeded fixtures.
#   2) Each user POSTs /matches/auto → they all land in the waiting pool
#      (or get paired off — drill is robust to a few pre-pair).
#   3) Snapshot PG match_waiting_pool row count.
#   4) `docker compose kill redis` — full SIGKILL, no graceful drain.
#   5) Verify PG row count unchanged (durability invariant).
#   6) `docker compose start redis` — Redis recovers empty.
#   7) Poll the Redis ZSET; assert non-empty within RECONCILE_DEADLINE_SECONDS.
#   8) Cleanup: each user DELETEs /matches/queue to leave the env quiet
#      for the next drill.
#
# Pre-conditions:
#   - `docker compose up -d` running (backend + worker + postgres + redis).
#   - `python backend/scripts/seed-load-users.py --count 5` (or more).
#
# Exit codes:
#   0 = pass, 1 = assertion failed, 2 = setup error.

set -euo pipefail

API_BASE="${API_BASE:-http://localhost:8000}"
N_USERS="${N_USERS:-5}"
PASSWORD="Loadtest123!"
RECONCILE_DEADLINE_SECONDS="${RECONCILE_DEADLINE_SECONDS:-35}"
PG_USER="${POSTGRES_USER:-lowbatterytown}"

bold() { printf "\033[1m%s\033[0m\n" "$*"; }
fail() { printf "\033[31mFAIL\033[0m %s\n" "$*" >&2; exit 1; }
ok() { printf "\033[32mOK\033[0m %s\n" "$*"; }
need() { command -v "$1" >/dev/null || { echo "missing dep: $1" >&2; exit 2; }; }

need curl
need jq
need docker

bold "[redis-chaos] phase 10 drill — $(date -u +%FT%TZ)"

# 1) Auth N users. Tokens are kept in an indexed array so step 8 can
#    cancel each user's queue entry without re-authing.
declare -a TOKENS
declare -a USER_IDS
for i in $(seq 1 "$N_USERS"); do
  email=$(printf "load-test-%03d@loadtest.lowbatterytown.local" "$i")
  resp=$(curl -sS --max-time 10 -X POST "$API_BASE/api/v1/auth/signin" \
    -H 'content-type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"$PASSWORD\"}") || fail "signin failed for $email"
  token=$(echo "$resp" | jq -r '.tokens.access_token')
  uid=$(echo "$resp" | jq -r '.user.id')
  if [[ -z "$token" || "$token" == "null" ]]; then
    echo "$resp" >&2
    fail "no access token for $email — did you run seed-load-users.py?"
  fi
  TOKENS+=("$token")
  USER_IDS+=("$uid")
done
ok "authed $N_USERS load-test users"

# 2) Enqueue each user. We do this serially so the first call enqueues
#    and subsequent calls may pair immediately; either way the durability
#    invariant (PG row present until match.proposed lands) is what we
#    actually test.
for token in "${TOKENS[@]}"; do
  status=$(curl -sS --max-time 10 -o /dev/null -w "%{http_code}" \
    -X POST -H "Authorization: Bearer $token" \
    "$API_BASE/api/v1/matches/auto") || fail "enqueue request errored"
  if [[ "$status" != "200" && "$status" != "201" && "$status" != "202" ]]; then
    fail "enqueue non-2xx: $status"
  fi
done
ok "enqueued $N_USERS waiters via POST /matches/auto"

# 3) Snapshot PG row count.
PG_BEFORE=$(docker compose exec -T postgres psql -U "$PG_USER" -tAc \
  "SELECT count(*) FROM match_waiting_pool WHERE status='waiting';" \
  | tr -d '[:space:]')
ok "pg waiting row count (pre-kill): $PG_BEFORE"
if [[ "${PG_BEFORE:-0}" -lt 1 ]]; then
  fail "no waiters in PG before kill — fixture failed (everyone paired instantly?)"
fi

# 4) Kill Redis.
docker compose kill redis >/dev/null
ok "killed redis (SIGKILL)"
sleep 3

# 5) PG durability invariant.
PG_AFTER_KILL=$(docker compose exec -T postgres psql -U "$PG_USER" -tAc \
  "SELECT count(*) FROM match_waiting_pool WHERE status='waiting';" \
  | tr -d '[:space:]')
if [[ "$PG_AFTER_KILL" -lt "$PG_BEFORE" ]]; then
  fail "pg waiting rows dropped after redis kill: $PG_BEFORE → $PG_AFTER_KILL"
fi
ok "pg waiting rows survived redis kill: $PG_AFTER_KILL"

# 6) Start Redis back up. Reconciler runs every 30s in the worker.
docker compose start redis >/dev/null
ok "restarted redis — waiting up to ${RECONCILE_DEADLINE_SECONDS}s for reconciler"

# 7) Poll the ZSET until we see ≥ PG_AFTER_KILL members (or the deadline).
deadline=$(( $(date +%s) + RECONCILE_DEADLINE_SECONDS ))
restored=0
while [[ $(date +%s) -lt $deadline ]]; do
  count=$(docker compose exec -T redis redis-cli ZCARD match:wait:queue \
    2>/dev/null | tr -d '[:space:]' || echo 0)
  if [[ "${count:-0}" -ge "$PG_AFTER_KILL" ]]; then
    restored=1
    elapsed=$(( $(date +%s) - (deadline - RECONCILE_DEADLINE_SECONDS) ))
    ok "redis ZSET repopulated to $count (≥ $PG_AFTER_KILL pg waiters) in ${elapsed}s"
    break
  fi
  sleep 2
done
if [[ "$restored" -ne 1 ]]; then
  final=$(docker compose exec -T redis redis-cli ZCARD match:wait:queue 2>/dev/null || echo 0)
  fail "reconciler did not repopulate within ${RECONCILE_DEADLINE_SECONDS}s — ZCARD=$final, pg=$PG_AFTER_KILL"
fi

# 8) Cleanup — best-effort cancel for every user so the next drill
#    starts clean. Idempotent (204 even if already gone).
for token in "${TOKENS[@]}"; do
  curl -sS --max-time 5 -o /dev/null \
    -X DELETE -H "Authorization: Bearer $token" \
    "$API_BASE/api/v1/matches/queue" || true
done
ok "cancelled all $N_USERS queue entries (cleanup)"

bold "[redis-chaos] PASS"

#!/usr/bin/env bash
# Phase 10 chaos drill — Worker crash mid-timer-tick.
#
# Verifies the Phase 05 ``redis_leader_lock`` (single-leader election
# for scheduled jobs across N workers): killing the active leader hands
# the lease off to the surviving worker, and the ``room_timer_tick``
# job — which fires every ~1s and emits ``room.timer_tick`` to all
# subscribers — recovers within the lease grace period.
#
# Drill outline:
#   1) `docker compose up -d --scale worker=2`.
#   2) Auth A + B, pair, accept, both join the room.
#   3) Arm the shared timer via POST /rooms/match/{id}/start
#      (duration_seconds=60 so we have headroom for the kill + recover).
#   4) Subscribe A's WS to ``room:{id}`` and tail timer_tick frames.
#   5) Confirm steady-state tick cadence (≥ 2 ticks in 3s).
#   6) Kill one worker replica.
#   7) Assert: the NEXT timer_tick after the kill arrives within 5s of
#      the previous one — i.e. the surviving worker picked up the lease.
#
# Pre-conditions:
#   - `docker compose up -d` running.
#   - `python backend/scripts/seed-load-users.py --count 2`.
#
# Drill ends with worker scaled back to 1 so subsequent runs aren't
# polluted by stale replicas.
#
# Exit codes:
#   0 = pass, 1 = assertion failed, 2 = setup error.

set -euo pipefail

API_BASE="${API_BASE:-http://localhost:8000}"
PASSWORD="Loadtest123!"
WS_LISTENER="/app/scripts/_ws_listener.py"
WS_LISTENER_HOST="$(dirname "$0")/_ws_listener.py"
HANDOFF_BUDGET_S="${HANDOFF_BUDGET_S:-5}"
STEADY_TICK_WINDOW_S="${STEADY_TICK_WINDOW_S:-3}"
STEADY_TICK_MIN="${STEADY_TICK_MIN:-2}"
TIMER_DURATION_S="${TIMER_DURATION_S:-60}"

bold() { printf "\033[1m%s\033[0m\n" "$*"; }
fail() { printf "\033[31mFAIL\033[0m %s\n" "$*" >&2; cleanup_scale; exit 1; }
ok() { printf "\033[32mOK\033[0m %s\n" "$*"; }
need() { command -v "$1" >/dev/null || { echo "missing dep: $1" >&2; exit 2; }; }

need curl
need jq
need docker

bold "[worker-chaos] phase 10 drill — $(date -u +%FT%TZ)"

cleanup_scale() {
  docker compose up -d --scale worker=1 >/dev/null 2>&1 || true
}

trap cleanup_scale EXIT

# Make sure the listener is on the bind mount at backend/scripts/ so the
# backend container can exec it. (Workers share the same image; we exec
# via a backend container which has the same Python env.)
cp "$WS_LISTENER_HOST" "$(pwd)/backend/scripts/_ws_listener.py"

# 1) Scale worker to 2.
docker compose up -d --scale worker=2 >/dev/null
ok "scaled worker to 2 replicas"
sleep 3  # let both workers register heartbeats + race for leader lock

# 2) Auth + pair.
signin() {
  curl -sS --max-time 10 -X POST "$API_BASE/api/v1/auth/signin" \
    -H 'content-type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$PASSWORD\"}"
}
respA=$(signin "load-test-001@loadtest.lowbatterytown.com")
respB=$(signin "load-test-002@loadtest.lowbatterytown.com")
TOK_A=$(echo "$respA" | jq -r '.tokens.access_token')
TOK_B=$(echo "$respB" | jq -r '.tokens.access_token')
[[ -n "$TOK_A" && "$TOK_A" != "null" ]] || fail "A signin failed: $respA"
[[ -n "$TOK_B" && "$TOK_B" != "null" ]] || fail "B signin failed: $respB"

curl -sS --max-time 10 -o /dev/null \
  -X POST -H "Authorization: Bearer $TOK_A" "$API_BASE/api/v1/matches/auto"
RESP_B=$(curl -sS --max-time 10 \
  -X POST -H "Authorization: Bearer $TOK_B" "$API_BASE/api/v1/matches/auto")
match_id=$(echo "$RESP_B" | jq -r '.match.id // empty')
[[ -n "$match_id" ]] || fail "B did not pair: $RESP_B"

curl -sS --max-time 5 -o /dev/null -X POST -H "Authorization: Bearer $TOK_A" "$API_BASE/api/v1/matches/$match_id/accept"
curl -sS --max-time 5 -o /dev/null -X POST -H "Authorization: Bearer $TOK_B" "$API_BASE/api/v1/matches/$match_id/accept"

JOIN_A=$(curl -sS --max-time 5 -X POST -H "Authorization: Bearer $TOK_A" "$API_BASE/api/v1/rooms/match/$match_id/join")
curl -sS --max-time 5 -o /dev/null -X POST -H "Authorization: Bearer $TOK_B" "$API_BASE/api/v1/rooms/match/$match_id/join"
room_id=$(echo "$JOIN_A" | jq -r '.id')
[[ -n "$room_id" && "$room_id" != "null" ]] || fail "no room_id: $JOIN_A"
ok "paired + joined room=$room_id"

# 3) Arm the timer for 60s.
start_resp=$(curl -sS --max-time 5 \
  -X POST -H "Authorization: Bearer $TOK_A" \
  -H 'content-type: application/json' \
  -d "{\"duration_seconds\": $TIMER_DURATION_S}" \
  "$API_BASE/api/v1/rooms/match/$match_id/start")
[[ "$(echo "$start_resp" | jq -r '.status')" == "active" ]] \
  || fail "room not active after start: $start_resp"
ok "timer armed (status=active, duration=${TIMER_DURATION_S}s)"

# 4) Spawn A's WS listener via a backend container (any will do for WS
#    delivery — the worker is the producer; the backend is the consumer
#    /  WS bridge). Listener runs for the full drill duration.
BACKEND_CID=$(docker compose ps -q backend | head -n1)
[[ -n "$BACKEND_CID" ]] || fail "no backend container running"

OUT_A=$(mktemp)
docker exec -i "$BACKEND_CID" python "$WS_LISTENER" \
  --host localhost --port 8000 \
  --token "$TOK_A" --channel "room:$room_id" --duration 45 \
  >"$OUT_A" 2>&1 &
LISTENER_PID=$!
sleep 1.5  # let subscribe handshake complete

# 5) Confirm steady-state tick cadence — at least N ticks in T seconds.
sleep "$STEADY_TICK_WINDOW_S"
pre_count=$(grep -c '"type": "room.timer_tick"' "$OUT_A" || true)
[[ "${pre_count:-0}" -ge "$STEADY_TICK_MIN" ]] \
  || fail "steady-state cadence too slow: $pre_count ticks in ${STEADY_TICK_WINDOW_S}s (need ≥ $STEADY_TICK_MIN)"
ok "steady-state cadence: $pre_count ticks in ${STEADY_TICK_WINDOW_S}s"

# Capture last tick timestamp BEFORE killing the worker.
last_tick_pre_ms=$(grep '"type": "room.timer_tick"' "$OUT_A" \
  | tail -n1 | jq -r '.received_at_ms')
[[ -n "$last_tick_pre_ms" && "$last_tick_pre_ms" != "null" ]] \
  || fail "could not parse last pre-kill tick timestamp"

# 6) Kill one worker — pick the first listed.
mapfile -t WORKERS < <(docker compose ps -q worker)
[[ "${#WORKERS[@]}" -ge 2 ]] || fail "fewer than 2 worker replicas (got ${#WORKERS[@]})"
KILL_TARGET="${WORKERS[0]}"
docker kill "$KILL_TARGET" >/dev/null
ok "killed worker $KILL_TARGET"

# 7) Wait up to HANDOFF_BUDGET_S for the next tick AFTER the kill mark.
kill_mark_ms=$(( $(date +%s%3N) ))
deadline=$(( $(date +%s) + HANDOFF_BUDGET_S + 2 ))  # +2s slack for poll resolution
handed_off=0
while [[ $(date +%s) -lt $deadline ]]; do
  # Look for any tick whose received_at_ms > kill_mark_ms.
  newest_ms=$(grep '"type": "room.timer_tick"' "$OUT_A" \
    | tail -n1 | jq -r '.received_at_ms' 2>/dev/null || echo 0)
  if [[ "${newest_ms:-0}" -gt "$kill_mark_ms" ]]; then
    gap_ms=$(( newest_ms - last_tick_pre_ms ))
    handed_off=1
    ok "tick observed post-kill: gap from last pre-kill tick = ${gap_ms}ms"
    if [[ "$gap_ms" -gt $(( (HANDOFF_BUDGET_S + 2) * 1000 )) ]]; then
      fail "handoff gap exceeded budget: ${gap_ms}ms"
    fi
    break
  fi
  sleep 0.5
done

kill "$LISTENER_PID" 2>/dev/null || true
wait "$LISTENER_PID" 2>/dev/null || true

if [[ "$handed_off" -ne 1 ]]; then
  echo "--- listener tail ---" >&2
  tail -n 40 "$OUT_A" >&2 || true
  rm -f "$OUT_A"
  fail "no tick observed within ${HANDOFF_BUDGET_S}s post-kill — leader handoff broken?"
fi

rm -f "$OUT_A"
bold "[worker-chaos] PASS"

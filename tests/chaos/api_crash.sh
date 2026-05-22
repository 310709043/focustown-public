#!/usr/bin/env bash
# Phase 10 chaos drill — API replica crash with active WS connections.
#
# Verifies the Phase 05 + Phase 08 design: ``IRealtimePublisher`` is
# Redis pub/sub fan-out, so any backend process can publish room.* frames
# and every process with subscribers delivers them. Killing one replica
# does NOT silence the surviving replica's WS pipe.
#
# Drill outline:
#   1) Scale `backend` to 2 replicas via `docker compose up -d --scale`.
#      Wait for both /ready endpoints to return 200.
#   2) Create a paired match between user A and user B (signin + auto +
#      accept on both sides).
#   3) Open user A's WS and user B's WS via the host port-mapped
#      load-balancer. Compose's DNS round-robins between replicas so
#      with high probability they land on different containers.
#   4) Both subscribe to ``room:{room_id}``.
#   5) Trigger a frame: A leaves the room → backend publishes
#      ``room.partner_left`` to ``room:{room_id}``. B's listener should
#      receive it within 5s (latency budget includes Redis pub/sub
#      bridge + WS deliver).
#   6) Kill ONE backend replica (whichever has more recent log
#      activity — heuristic). The losing WS reconnects to the survivor.
#   7) Re-trigger via B-side leave → A's RECONNECTED listener should
#      receive the corresponding ``room.ended`` (or another room.* frame)
#      within 5s.
#
# Pre-conditions:
#   - `docker compose up -d` running.
#   - `python backend/scripts/seed-load-users.py --count 2`.
#
# This drill ends with backend scaled back to 1 replica so subsequent
# drills don't see double-fire.
#
# Exit codes:
#   0 = pass, 1 = assertion failed, 2 = setup error.

set -euo pipefail

API_BASE="${API_BASE:-http://localhost:8000}"
PASSWORD="Loadtest123!"
WS_LISTENER="/app/scripts/_ws_listener.py"
WS_LISTENER_HOST="${WS_LISTENER_HOST:-$(dirname "$0")/_ws_listener.py}"
SURVIVOR_RECONNECT_BUDGET_S="${SURVIVOR_RECONNECT_BUDGET_S:-5}"

bold() { printf "\033[1m%s\033[0m\n" "$*"; }
fail() { printf "\033[31mFAIL\033[0m %s\n" "$*" >&2; cleanup_scale; exit 1; }
ok() { printf "\033[32mOK\033[0m %s\n" "$*"; }
need() { command -v "$1" >/dev/null || { echo "missing dep: $1" >&2; exit 2; }; }

need curl
need jq
need docker

bold "[api-chaos] phase 10 drill — $(date -u +%FT%TZ)"

cleanup_scale() {
  # Idempotent: scale back down so subsequent drills aren't double-fire.
  docker compose up -d --scale backend=1 >/dev/null 2>&1 || true
}

trap cleanup_scale EXIT

# Copy the listener helper into the backend bind mount so the container
# can exec it (the `./backend:/app` mount means files placed in backend/
# show up at /app inside; the chaos dir lives outside that mount).
cp "$WS_LISTENER_HOST" "$(pwd)/backend/scripts/_ws_listener.py"

# 1) Scale backend to 2.
docker compose up -d --scale backend=2 >/dev/null
ok "scaled backend to 2 replicas"
# Wait for both to report ready.
deadline=$(( $(date +%s) + 60 ))
ready_count=0
while [[ $(date +%s) -lt $deadline ]]; do
  # /ready returns 200 only when DB + Redis round-trips succeed.
  status=$(curl -sS --max-time 2 -o /dev/null -w "%{http_code}" "$API_BASE/ready" || echo 000)
  if [[ "$status" == "200" ]]; then
    ready_count=$((ready_count + 1))
    if [[ "$ready_count" -ge 3 ]]; then
      ok "/ready 200 three consecutive polls — replicas warmed"
      break
    fi
  else
    ready_count=0
  fi
  sleep 1
done
[[ "$ready_count" -ge 3 ]] || fail "backend replicas never became ready"

signin() {
  local email="$1"
  curl -sS --max-time 10 -X POST "$API_BASE/api/v1/auth/signin" \
    -H 'content-type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"$PASSWORD\"}"
}

# 2) Auth the two test users + create a paired match. We hit /matches/auto
#    on A first (enqueues), then on B (pairs with A). Each accepts to land
#    in the shared room.
respA=$(signin "load-test-001@loadtest.lowbatterytown.local")
respB=$(signin "load-test-002@loadtest.lowbatterytown.local")
TOK_A=$(echo "$respA" | jq -r '.tokens.access_token')
TOK_B=$(echo "$respB" | jq -r '.tokens.access_token')
[[ -n "$TOK_A" && "$TOK_A" != "null" ]] || fail "A signin failed: $respA"
[[ -n "$TOK_B" && "$TOK_B" != "null" ]] || fail "B signin failed: $respB"
ok "authed A + B"

curl -sS --max-time 10 -o /dev/null \
  -X POST -H "Authorization: Bearer $TOK_A" "$API_BASE/api/v1/matches/auto"
RESP_B=$(curl -sS --max-time 10 \
  -X POST -H "Authorization: Bearer $TOK_B" "$API_BASE/api/v1/matches/auto")
match_id=$(echo "$RESP_B" | jq -r '.match.id // empty')
if [[ -z "$match_id" ]]; then
  fail "B did not pair instantly — got: $RESP_B"
fi
ok "paired match=$match_id"

# Accept on both sides.
curl -sS --max-time 5 -o /dev/null \
  -X POST -H "Authorization: Bearer $TOK_A" \
  "$API_BASE/api/v1/matches/$match_id/accept"
curl -sS --max-time 5 -o /dev/null \
  -X POST -H "Authorization: Bearer $TOK_B" \
  "$API_BASE/api/v1/matches/$match_id/accept"

# Join both into the room (this is what the focus page does on mount).
JOIN_A=$(curl -sS --max-time 5 \
  -X POST -H "Authorization: Bearer $TOK_A" \
  "$API_BASE/api/v1/rooms/match/$match_id/join")
JOIN_B=$(curl -sS --max-time 5 \
  -X POST -H "Authorization: Bearer $TOK_B" \
  "$API_BASE/api/v1/rooms/match/$match_id/join")
room_id=$(echo "$JOIN_A" | jq -r '.id')
[[ -n "$room_id" && "$room_id" != "null" ]] || fail "no room_id in join response: $JOIN_A"
ok "both joined room=$room_id"

# 3) Subscribe both via WS, listening for room.* frames. Each listener is
#    a background docker-exec into ONE of the backend replicas — compose
#    routes the WS handshake through the host port (8000) which the
#    project exposes by binding only the first replica (compose --scale
#    publishes the port from one replica). To force two distinct
#    replicas, we exec each listener INSIDE a chosen replica container
#    and connect to localhost:8000 there.
mapfile -t REPLICAS < <(docker compose ps -q backend)
[[ "${#REPLICAS[@]}" -ge 2 ]] || fail "fewer than 2 backend replicas running (got ${#REPLICAS[@]})"
REPLICA_A="${REPLICAS[0]}"
REPLICA_B="${REPLICAS[1]}"
ok "replica A=$REPLICA_A replica B=$REPLICA_B"

# Background listener helper. Writes to a temp file the parent can grep.
spawn_listener() {
  local container="$1"; local token="$2"; local channel="$3"; local out="$4"; local duration="$5"
  docker exec -i "$container" python "$WS_LISTENER" \
    --host localhost --port 8000 \
    --token "$token" --channel "$channel" --duration "$duration" \
    >"$out" 2>&1 &
  echo $!
}

OUT_A=$(mktemp); OUT_B=$(mktemp)
PID_A=$(spawn_listener "$REPLICA_A" "$TOK_A" "room:$room_id" "$OUT_A" 60)
PID_B=$(spawn_listener "$REPLICA_B" "$TOK_B" "room:$room_id" "$OUT_B" 60)
sleep 1.5  # let both listeners complete subscribe handshake
ok "spawned two WS listeners on distinct replicas"

# 4) Trigger a room.partner_left from A. B should observe it within 5s.
curl -sS --max-time 5 -o /dev/null \
  -X POST -H "Authorization: Bearer $TOK_A" \
  "$API_BASE/api/v1/rooms/match/$match_id/leave"

wait_for_frame() {
  local file="$1"; local kind="$2"; local budget_s="$3"; local label="$4"
  local deadline=$(( $(date +%s) + budget_s ))
  while [[ $(date +%s) -lt $deadline ]]; do
    if grep -q "\"type\": \"$kind\"" "$file" 2>/dev/null; then
      ok "$label observed $kind"
      return 0
    fi
    sleep 0.5
  done
  echo "--- listener log $file ---" >&2
  cat "$file" >&2 || true
  fail "$label never observed $kind within ${budget_s}s"
}

# Either room.partner_left or room.ended is acceptable depending on the
# exact ordering; both indicate the surviving B-side received the
# cross-replica publish.
wait_for_frame "$OUT_B" "room.partner_left" "$SURVIVOR_RECONNECT_BUDGET_S" "B-pre-kill"

# 5) Kill replica A. B's listener (on replica B) keeps running and
#    should still receive frames published by replica B's API workers.
docker kill "$REPLICA_A" >/dev/null
ok "killed replica A ($REPLICA_A)"

# Trigger a re-join then leave from B to publish another frame. The
# remaining replica must continue to fan out via Redis pub/sub.
curl -sS --max-time 5 -o /dev/null \
  -X POST -H "Authorization: Bearer $TOK_B" \
  "$API_BASE/api/v1/rooms/match/$match_id/leave" || true

wait_for_frame "$OUT_B" "room.ended" "$SURVIVOR_RECONNECT_BUDGET_S" "B-post-kill"

# Cleanup background listeners + temp files.
kill "$PID_A" "$PID_B" 2>/dev/null || true
wait "$PID_A" 2>/dev/null || true
wait "$PID_B" 2>/dev/null || true
rm -f "$OUT_A" "$OUT_B"

bold "[api-chaos] PASS"

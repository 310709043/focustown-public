# Phase 10 — Verification Results

Captures the actually-measured numbers from running the Phase 10
verification surface (Playwright two-user spec, k6 100-VU load test,
three chaos drills). The numbers below come from running each drill
**three times** on a fresh `docker compose up -d` stack and recording
the median.

Re-run procedure:

```bash
# Bring up a clean stack
cp .env.example .env
docker compose up --build -d
docker compose exec backend alembic upgrade head
docker compose exec backend python /app/scripts/seed-dev-data.py
docker compose exec backend python /app/scripts/seed-load-users.py --count 100

# 1) Playwright (real stack flag opts in)
cd frontend
PLAYWRIGHT_REAL_STACK=1 pnpm playwright test \
  e2e/match-to-room-full-flow.spec.ts --reporter=line

# 2) k6
cd ../tests/load
k6 run match_queue.js --summary-export=summary.json

# 3) Chaos
cd ../chaos
bash redis_crash.sh
bash api_crash.sh
bash worker_crash.sh
```

## Drill matrix

| Drill | Acceptance criterion | Measured (median of 3) | Pass |
|---|---|---|---|
| **Playwright two-user** | Full flow completes within 120s, no flake | _to be filled_ | ☐ |
| **k6 100 VU — time_to_match p95** | ≤ 5,000 ms | _to be filled_ | ☐ |
| **k6 100 VU — time_to_match p99** | ≤ 10,000 ms | _to be filled_ | ☐ |
| **k6 100 VU — http_req_failed** | < 1% | _to be filled_ | ☐ |
| **Redis chaos** | PG row count survives kill; Redis ZSET ≥ PG count within 35s of restart | _to be filled_ | ☐ |
| **API chaos** | Surviving client observes next room.* frame within 5s of cross-replica reconnect | _to be filled_ | ☐ |
| **Worker chaos** | room.timer_tick cadence resumes within 5s of leader-replica kill | _to be filled_ | ☐ |

## Per-drill detail

### 1. Playwright `match-to-room-full-flow.spec.ts`

Two browser contexts drive the queue → match → accept → join → start →
tick → leave path against the live stack. Total wall-clock per run
(signup → ended): _to be filled_ seconds. Splash-clear, modal-flip, and
timer-tick assertions all have explicit timeouts in the spec so a
single flake exposes the broken phase, not "the test is slow".

Known coverage gap: the "Start" button currently triggers the LOCAL
solo timer (`useTimerStore.start`), not the server-driven shared timer
endpoint. The spec calls `POST /rooms/match/{id}/start` directly until
the UI control is wired. Tracked separately from Phase 10 (Phase 08
follow-up).

### 2. k6 — matching queue saturation

100 VUs ramp over 20s, hold 60s. Each VU signs in once (re-uses token
across the iteration) so login/bcrypt cost doesn't dominate the timing
signal. Pairing latency is measured as `now - POST /matches/auto start`
via long-poll on `GET /matches/queue/me` (404 == "row gone, pair landed").

Summary (`k6 run --summary-export=summary.json`):

```json
{
  "metrics": {
    "time_to_match_ms": {
      "p(50)_ms": "to be filled",
      "p(95)_ms": "to be filled",
      "p(99)_ms": "to be filled"
    },
    "paired_rate": "to be filled",
    "http_req_failed_rate": "to be filled"
  }
}
```

### 3. Redis crash

Sequence (from `redis_crash.sh`):

- Enqueue 5 waiters → PG `match_waiting_pool` row count = N
- `docker compose kill redis`
- PG count unchanged ✅ (this is the durability invariant)
- `docker compose start redis`
- `ZCARD match:wait:queue` reaches ≥ N within `RECONCILE_DEADLINE_SECONDS=35`

Measured reconcile time (median of 3): _to be filled_ seconds.

### 4. API replica crash

Sequence (from `api_crash.sh`):

- Scale `backend` to 2 replicas
- Pair A + B via API
- Spawn one WS listener per replica
- A leaves → B observes `room.partner_left` within 5s (pre-kill check)
- `docker kill <replica-A>`
- Trigger from B → its listener (on replica-B) still observes the
  resulting `room.ended` via Redis pub/sub bridge within 5s

Median observed reconnect-to-frame latency: _to be filled_ ms.

### 5. Worker crash

Sequence (from `worker_crash.sh`):

- Scale `worker` to 2 replicas; sleep 3s for leader-lock contention
- Pair A + B, arm timer for 60s
- Listen on `room:{id}` for `room.timer_tick` frames
- Verify steady-state cadence: ≥ 2 ticks in 3s pre-kill
- `docker kill <worker[0]>`
- Verify the NEXT tick arrives within `HANDOFF_BUDGET_S=5` of the
  last pre-kill tick

Median observed handoff gap (last pre-kill tick → first post-kill tick):
_to be filled_ ms.

## Notes for future runs

- The `_ws_listener.py` helper lives in `tests/chaos/` so it can be
  reviewed alongside the drills it powers. The drill scripts copy it
  into `backend/scripts/` at run-time so the backend container's bind
  mount picks it up — it does NOT need to be committed under
  `backend/scripts/`.
- The k6 thresholds in `tests/load/match_queue.js` (`p(95)<5000`,
  `p(99)<10000`, `paired_rate>0.80`, `http_req_failed<0.01`) are the
  enforced gates — `k6 run` exits non-zero if any breaches.
- The Playwright spec is opt-in (`PLAYWRIGHT_REAL_STACK=1`) so the
  regular mocked-backend Playwright run in `frontend.yml` stays green
  without a real stack. The dedicated workflow in `.github/workflows/
  e2e.yml` sets the flag.

// k6 load test — Phase 10 matching queue saturation.
//
// Scenario: 100 virtual users sign in once at VU init, then each posts
// POST /api/v1/matches/auto and polls GET /api/v1/matches/queue/me until
// either (a) the queue endpoint 404s (pair landed → user got pulled out)
// or (b) the per-VU deadline elapses. The "pair landed" path measures
// the time-to-match via a custom Trend metric; the threshold gate then
// asserts p95 ≤ 5s and p99 ≤ 10s per Phase 10 acceptance criteria.
//
// Pre-conditions:
//   - `docker compose up -d` (postgres + redis + backend + worker).
//   - `python backend/scripts/seed-load-users.py --count 100` to create
//     the load-test-001..load-test-100 fixtures (idempotent).
//
// Usage:
//   k6 run tests/load/match_queue.js
//   k6 run --vus 50 --duration 60s tests/load/match_queue.js
//   API_BASE=http://localhost:8000 LOAD_VUS=100 k6 run tests/load/match_queue.js
//
// Why long-poll over WS-driven signal:
//   The realistic time-to-pair signal lives in either (a) the match.proposed
//   WS frame or (b) the queue/me 404 (the queue service deletes the row
//   on pair). k6 doesn't natively speak our auth'd WS subprotocol; the
//   queue/me approach is a straight HTTP poll and exercises the same
//   downstream guarantee (sweep job successfully removed the waiter).

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate, Counter } from "k6/metrics";

const API_BASE = __ENV.API_BASE || "http://localhost:8000";
const LOAD_VUS = parseInt(__ENV.LOAD_VUS || "100", 10);
const LOAD_DURATION = __ENV.LOAD_DURATION || "60s";
const RAMP_DURATION = __ENV.RAMP_DURATION || "20s";
const PASSWORD = "Loadtest123!";
const PAIR_POLL_INTERVAL_MS = 500;
const PAIR_POLL_TIMEOUT_MS = 30_000;

// Custom metrics — k6's built-in http_req_duration tracks per-request
// latency; the matching-flow latency is a multi-step round-trip, so we
// emit our own Trend keyed on time_to_match (ms).
const timeToMatch = new Trend("time_to_match_ms", true);
const pairedRate = new Rate("paired_rate");
const enqueuedTotal = new Counter("enqueued_total");
const matchedTotal = new Counter("matched_total");

export const options = {
  scenarios: {
    enqueue_and_pair: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: RAMP_DURATION, target: LOAD_VUS },
        { duration: LOAD_DURATION, target: LOAD_VUS },
        { duration: "10s", target: 0 },
      ],
      gracefulRampDown: "5s",
    },
  },
  thresholds: {
    // Phase 10 acceptance: 95% paired within 5s, 99% within 10s.
    "time_to_match_ms": ["p(95)<5000", "p(99)<10000"],
    // Overall request error budget — auth + enqueue + queue/me polls.
    "http_req_failed": ["rate<0.01"],
    // The whole point of the run: at least 80% of VUs must pair (some
    // will hit the 30s deadline if traffic is uneven across the ramp,
    // but the bulk should be matched).
    "paired_rate": ["rate>0.80"],
  },
  // Tagging the summary so artifacts uploaded by CI can be parsed by
  // a future dashboard without diffing line-by-line.
  tags: { phase: "10", suite: "matching-queue" },
};

function login(email, password) {
  const res = http.post(
    `${API_BASE}/api/v1/auth/signin`,
    JSON.stringify({ email, password }),
    { headers: { "Content-Type": "application/json" } },
  );
  check(res, {
    "signin 200": (r) => r.status === 200,
  });
  if (res.status !== 200) {
    return null;
  }
  return res.json("tokens.access_token");
}

function pollUntilPaired(token, startedAtMs) {
  // 200 = still waiting (returns enqueued_at_ms + bot_fallback_at_ms).
  // 404 = not in queue — either paired or never enqueued. From our
  //       state machine that means "paired", because we just enqueued
  //       in this iteration.
  const deadline = startedAtMs + PAIR_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = http.get(`${API_BASE}/api/v1/matches/queue/me`, {
      headers: { Authorization: `Bearer ${token}` },
      tags: { name: "queue_me_poll" },
    });
    if (res.status === 404) {
      return Date.now() - startedAtMs;
    }
    // 200 = still waiting; sleep then retry. The 500ms interval keeps
    // the timing resolution sharp without overwhelming the API.
    sleep(PAIR_POLL_INTERVAL_MS / 1000);
  }
  return null;
}

export function setup() {
  // Sanity-check the seed exists. If the first login fails we surface
  // a clear error rather than letting every VU error in parallel.
  const token = login("load-test-001@loadtest.lowbatterytown.local", PASSWORD);
  if (!token) {
    throw new Error(
      "load-test-001 cannot sign in — did you run `python backend/scripts/seed-load-users.py`?",
    );
  }
  return { ready: true };
}

export default function () {
  // Distribute VUs across the seeded pool. __VU is 1-indexed; seed
  // script creates load-test-001..load-test-NNN.
  const userN = ((__VU - 1) % LOAD_VUS) + 1;
  const email = `load-test-${String(userN).padStart(3, "0")}@loadtest.lowbatterytown.local`;
  const token = login(email, PASSWORD);
  if (!token) {
    return;
  }

  const startedAt = Date.now();
  const enqueue = http.post(`${API_BASE}/api/v1/matches/auto`, null, {
    headers: { Authorization: `Bearer ${token}` },
    tags: { name: "matches_auto" },
  });

  const enqueueOk = check(enqueue, {
    "enqueue 2xx": (r) => r.status === 200 || r.status === 201 || r.status === 202,
  });
  if (!enqueueOk) {
    pairedRate.add(false);
    return;
  }
  enqueuedTotal.add(1);

  // Immediate pair (HTTP 201 → status === "matched") — record 0ms ttp
  // so the percentile bucket includes the happy path.
  if (enqueue.status === 201) {
    timeToMatch.add(Date.now() - startedAt);
    matchedTotal.add(1);
    pairedRate.add(true);
    return;
  }

  // HTTP 202 → status === "waiting". Poll the queue endpoint until
  // the row disappears (pair landed) or the deadline trips.
  const pairedInMs = pollUntilPaired(token, startedAt);
  if (pairedInMs === null) {
    pairedRate.add(false);
    return;
  }
  timeToMatch.add(pairedInMs);
  matchedTotal.add(1);
  pairedRate.add(true);
}

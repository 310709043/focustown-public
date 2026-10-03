import type { Page, Route } from "@playwright/test";

/**
 * Backend route mocking helpers for E2E tests.
 *
 * Usage:
 *   await mockApi(page, {
 *     "POST /api/v1/auth/signup": (route) => json(route, 200, { user, tokens }),
 *     "GET  /api/v1/auth/me":     (route) => json(route, 200, fixtures.user),
 *   });
 *
 * Unmocked endpoints return 404 with a `not_mocked` envelope so tests
 * surface accidental real-network attempts as obvious failures.
 */

type Handler = (route: Route) => Promise<void> | void;
type Scenarios = Record<string, Handler>;

export const fixtures = {
  user: {
    id: "u-test-1",
    email: "smoke@example.com",
    display_name: "Smoke",
    character_key: "luna",
    role_label: "UI 設計師",
    created_at: "2026-05-01T00:00:00Z",
    equipped_vehicle_item_id: null,
    equipped_vehicle: null,
  },
  tokens: {
    access_token: "fake.access.token",
    refresh_token: "fake.refresh.token",
  },
};

export function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

/** Common error envelope, matching backend's FocusTownError shape. */
export function err(route: Route, status: number, code: string, message: string): Promise<void> {
  return json(route, status, { error: { code, message } });
}

export async function mockApi(page: Page, scenarios: Scenarios): Promise<void> {
  await page.route("**/api/v1/**", async (route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());
    const key = `${method.padEnd(4)} ${url.pathname}`;
    // First try exact "METHOD /path", then fall back to "* /path".
    const handler =
      scenarios[key] ??
      scenarios[`${method} ${url.pathname}`] ??
      scenarios[url.pathname];
    if (handler) {
      await handler(route);
      return;
    }
    await err(route, 404, "not_mocked", `no mock for ${key}`);
  });
}

/** Common "everything green" baseline for /town tests. */
export function baselineTownMocks(): Scenarios {
  return {
    "GET  /api/v1/auth/me": (r) => json(r, 200, fixtures.user),
    "GET  /api/v1/presence/street": (r) => json(r, 200, []),
    "GET  /api/v1/me/wallet": (r) => json(r, 200, []),
    "GET  /api/v1/me/items": (r) => json(r, 200, []),
    "GET  /api/v1/tracks": (r) => json(r, 200, []),
  };
}

/**
 * Server-driven focus room for a paired /focus/{matchId} page. The page
 * GETs this snapshot before rendering the buddy scene and shows "room no
 * longer available" when it 404s, so every paired-room spec needs it.
 * Both participants have joined; the session hasn't started.
 */
export function matchRoomMocks(matchId: string, partnerId = "u-buddy-1"): Scenarios {
  const snapshot = {
    id: `room-${matchId}`,
    match_id: matchId,
    status: "both_joined",
    opened_at: "2026-05-22T00:00:00Z",
    activated_at: null,
    ended_at: null,
    ended_reason: null,
    participants: [
      { user_id: fixtures.user.id, role: "requester", joined_at: "2026-05-22T00:00:01Z", left_at: null, focus_session_id: null },
      { user_id: partnerId, role: "candidate", joined_at: "2026-05-22T00:00:02Z", left_at: null, focus_session_id: null },
    ],
    timer_started_at: null,
    timer_duration_seconds: null,
    timer_remaining_seconds: null,
    timer_expected_end_at: null,
  };
  return {
    [`GET  /api/v1/rooms/match/${matchId}`]: (r) => json(r, 200, snapshot),
    [`POST /api/v1/rooms/match/${matchId}/join`]: (r) => json(r, 200, snapshot),
  };
}

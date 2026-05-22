import { expect, test } from "@playwright/test";

import { baselineTownMocks, fixtures, json, mockApi } from "./helpers/mock-backend";
import { seedAuthTokens } from "./helpers/session";

const MATCH_ID = "match-rt-1";
const ROOM_ID = "room-rt-1";

/**
 * Phase 8 — server-driven shared focus room.
 *
 * The full two-browser realtime smoke (live WS + worker tick job) is a
 * manual verification step in the Phase 08 plan, since the existing
 * Playwright harness mocks every backend endpoint via ``mockApi``
 * (there's no real WS we can drive). This spec validates the UI seam:
 * when the server-sent snapshot reports an active timer, the page
 * renders the ``RoomTimer`` countdown + the "FOCUS SESSION" status
 * banner without a local setInterval — i.e. the wiring honours the
 * "server is the source of truth" contract.
 */
test.describe("/focus/[matchId] — Phase 8 server-driven timer overlay", () => {
  test("active snapshot renders timer overlay + status banner", async ({
    page,
  }) => {
    const activeSnapshot = {
      id: ROOM_ID,
      match_id: MATCH_ID,
      status: "active" as const,
      opened_at: "2026-05-22T00:00:00Z",
      activated_at: "2026-05-22T00:00:02Z",
      ended_at: null,
      ended_reason: null,
      participants: [
        {
          user_id: fixtures.user.id,
          role: "requester" as const,
          joined_at: "2026-05-22T00:00:01Z",
          left_at: null,
          focus_session_id: null,
        },
        {
          user_id: "u-buddy-1",
          role: "candidate" as const,
          joined_at: "2026-05-22T00:00:02Z",
          left_at: null,
          focus_session_id: null,
        },
      ],
      // Phase 8: server-stamped timer fields the focus page reads on
      // mount so a reload mid-session restores the countdown instantly.
      timer_started_at: "2026-05-22T00:00:02Z",
      timer_duration_seconds: 600,
      timer_remaining_seconds: 540,
      timer_expected_end_at: "2026-05-22T00:10:02Z",
    };

    await mockApi(page, {
      ...baselineTownMocks(),
      [`GET  /api/v1/rooms/match/${MATCH_ID}`]: (r) =>
        json(r, 200, activeSnapshot),
      [`POST /api/v1/rooms/match/${MATCH_ID}/join`]: (r) =>
        json(r, 200, activeSnapshot),
      [`GET  /api/v1/matches/${MATCH_ID}`]: (r) =>
        json(r, 200, {
          id: MATCH_ID,
          requester_id: fixtures.user.id,
          candidate_id: "u-buddy-1",
          requester_character_key: fixtures.user.character_key,
          candidate_character_key: "kai",
          compatibility: 80,
          reason: "test",
          state: "accepted",
          created_at: "2026-05-22T00:00:00Z",
        }),
      [`GET  /api/v1/matches/${MATCH_ID}/agenda`]: (r) =>
        json(r, 200, { items: [] }),
      [`GET  /api/v1/matches/${MATCH_ID}/chat`]: (r) =>
        json(r, 200, { messages: [] }),
      [`GET  /api/v1/matches/${MATCH_ID}/notes`]: (r) =>
        json(r, 200, { body: "" }),
    });
    await seedAuthTokens(page);

    await page.goto(`/focus/${MATCH_ID}`);
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });
    await expect(page.getByTestId("buddy-focus-scene")).toBeVisible({
      timeout: 5_000,
    });

    // Status banner mirrors the server-driven state; "FOCUS SESSION"
    // appears once status === "active" and the timer field is present.
    const banner = page.getByTestId("room-status-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/FOCUS SESSION/);

    // RoomTimer reads from the same store; with remainingSeconds = 540
    // the rendered MM:SS is exactly 09:00 (server is the source of truth
    // — no local setInterval is allowed to decrement this).
    const timer = page.getByTestId("room-timer-value");
    await expect(timer).toBeVisible();
    await expect(timer).toHaveText("09:00");
  });
});

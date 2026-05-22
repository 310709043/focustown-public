import { expect, test } from "@playwright/test";

import { baselineTownMocks, fixtures, json, mockApi } from "./helpers/mock-backend";
import { seedAuthTokens } from "./helpers/session";

const MATCH_ID = "match-room-1";
const ROOM_ID = "room-1";

/**
 * Phase 7 end-to-end flow on a single browser: the user lands on
 * /focus/{matchId} after accepting a match. We mock the room snapshot
 * to first report "only me joined" so the page renders the "Waiting
 * for partner" overlay; then we flip the mock to report the partner
 * also joined and force a re-hydrate to assert the overlay clears
 * into the BuddyFocusScene.
 *
 * Phase 10 will add the two-browser variant once the WS frames land
 * (Phase 08). For now this is the single-user smoke that pins the
 * server-driven gating contract.
 */
test.describe("/focus/[matchId] — Phase 7 room lifecycle gating", () => {
  test("waiting overlay → both joined → buddy scene", async ({ page }) => {
    // Mutable snapshot the mock returns. The mock handler reads it
    // each request so we can flip from "open / only-me joined" to
    // "both joined" mid-test.
    type Snapshot = {
      id: string;
      match_id: string;
      status: "open" | "both_joined" | "active" | "ended";
      opened_at: string;
      activated_at: string | null;
      ended_at: string | null;
      ended_reason: string | null;
      participants: Array<{
        user_id: string;
        role: "requester" | "candidate";
        joined_at: string | null;
        left_at: string | null;
        focus_session_id: string | null;
      }>;
    };
    let snapshot: Snapshot = {
      id: ROOM_ID,
      match_id: MATCH_ID,
      status: "open",
      opened_at: "2026-05-22T00:00:00Z",
      activated_at: null,
      ended_at: null,
      ended_reason: null,
      participants: [
        {
          user_id: fixtures.user.id,
          role: "requester",
          joined_at: "2026-05-22T00:00:01Z",
          left_at: null,
          focus_session_id: null,
        },
        {
          user_id: "u-buddy-1",
          role: "candidate",
          joined_at: null,
          left_at: null,
          focus_session_id: null,
        },
      ],
    };

    await mockApi(page, {
      ...baselineTownMocks(),
      [`GET  /api/v1/rooms/match/${MATCH_ID}`]: (r) => json(r, 200, snapshot),
      [`POST /api/v1/rooms/match/${MATCH_ID}/join`]: (r) =>
        json(r, 200, snapshot),
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
      // Buddy scene endpoints — only consulted after the overlay clears.
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

    // First render: partner hasn't joined yet → overlay visible, buddy
    // scene not mounted.
    const overlay = page.getByTestId("focus-room-overlay");
    await expect(overlay).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId("buddy-focus-scene")).toHaveCount(0);

    // Partner joins server-side. Flip the mock and force a re-render
    // by reloading — Phase 8 will land WS push that obsoletes this
    // reload-driven smoke.
    snapshot = {
      ...snapshot,
      status: "both_joined",
      activated_at: "2026-05-22T00:00:02Z",
      participants: snapshot.participants.map((p, i) =>
        i === 1 ? { ...p, joined_at: "2026-05-22T00:00:02Z" } : p,
      ),
    };
    await page.reload();
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });

    // Overlay clears; the buddy scene takes over.
    await expect(page.getByTestId("focus-room-overlay")).toHaveCount(0);
    await expect(page.getByTestId("buddy-focus-scene")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("non-participant lands on not-found overlay (404)", async ({ page }) => {
    await mockApi(page, {
      ...baselineTownMocks(),
      [`GET  /api/v1/rooms/match/${MATCH_ID}`]: (r) =>
        json(r, 404, { error: { code: "not_found", message: "match_room_not_found" } }),
      [`GET  /api/v1/matches/${MATCH_ID}`]: (r) =>
        json(r, 403, { error: { code: "forbidden", message: "not_match_member" } }),
    });
    await seedAuthTokens(page);

    await page.goto(`/focus/${MATCH_ID}`);
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });

    const overlay = page.getByTestId("focus-room-overlay");
    await expect(overlay).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId("buddy-focus-scene")).toHaveCount(0);
  });
});

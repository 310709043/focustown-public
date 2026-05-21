import { expect, test } from "@playwright/test";

import { baselineTownMocks, fixtures, json, mockApi } from "./helpers/mock-backend";
import { seedAuthTokens } from "./helpers/session";

const MATCH_ID = "match-test-1";

/**
 * Structural alignment for /focus/{matchId} (BuddyFocusScene). Asserts
 * reference's two-column layout: buddy-header-card / shared-timer /
 * status-mini / shared-agenda / room-music on the left, shared-panel
 * with chat/notes tabs on the right, plus the always-on RainOverlay.
 */
test.describe("/focus/[matchId] — reference parity", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, {
      ...baselineTownMocks(),
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
          created_at: "2026-05-01T00:00:00Z",
        }),
      [`GET  /api/v1/matches/${MATCH_ID}/agenda`]: (r) =>
        json(r, 200, {
          items: [
            { id: "a1", match_id: MATCH_ID, position: 0, body: "番茄 #1 · 25 min", status: "done",      created_by: "u-test-1", checked_by: null, checked_at: null, created_at: "2026-05-01T00:00:00Z", updated_at: "2026-05-01T00:00:00Z" },
            { id: "a2", match_id: MATCH_ID, position: 1, body: "5 min 互唸",        status: "done",      created_by: "u-test-1", checked_by: null, checked_at: null, created_at: "2026-05-01T00:00:00Z", updated_at: "2026-05-01T00:00:00Z" },
            { id: "a3", match_id: MATCH_ID, position: 2, body: "番茄 #2 · 25 min", status: "in_progress", created_by: "u-test-1", checked_by: null, checked_at: null, created_at: "2026-05-01T00:00:00Z", updated_at: "2026-05-01T00:00:00Z" },
            { id: "a4", match_id: MATCH_ID, position: 3, body: "番茄 #3 · 改寫",   status: "pending",   created_by: "u-test-1", checked_by: null, checked_at: null, created_at: "2026-05-01T00:00:00Z", updated_at: "2026-05-01T00:00:00Z" },
            { id: "a5", match_id: MATCH_ID, position: 4, body: "LOFI BAR 慶祝",  status: "pending",   created_by: "u-test-1", checked_by: null, checked_at: null, created_at: "2026-05-01T00:00:00Z", updated_at: "2026-05-01T00:00:00Z" },
          ],
        }),
      [`GET  /api/v1/matches/${MATCH_ID}/chat`]: (r) => json(r, 200, { messages: [] }),
      [`GET  /api/v1/matches/${MATCH_ID}/notes`]: (r) => json(r, 200, { body: "" }),
    });
    await seedAuthTokens(page);
  });

  test("buddy scene mounts both buddy cards + shared timer + status + agenda + room music + shared panel + rain", async ({ page }) => {
    await page.goto(`/focus/${MATCH_ID}`);
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });

    await expect(page.getByTestId("buddy-focus-scene")).toBeVisible();

    const header = page.getByTestId("buddy-header-card");
    await expect(header).toBeVisible();
    await expect(header.locator('[data-side="me"]')).toBeVisible();
    await expect(header.locator('[data-side="buddy"]')).toBeVisible();

    const timer = page.getByTestId("shared-timer");
    await expect(timer).toBeVisible();
    // SharedTimer now exposes 2 controls (toggle + reset); a third
    // legacy button was dropped during the Phase-9 timer refactor.
    await expect(timer.locator("button.pixel-btn")).toHaveCount(2);

    await expect(page.getByTestId("status-mini")).toBeVisible();
    await expect(page.getByTestId("shared-agenda")).toBeVisible();
    await expect(page.getByTestId("room-music")).toBeVisible();

    const sharedPanel = page.getByTestId("shared-panel");
    await expect(sharedPanel).toBeVisible();
    await expect(sharedPanel.locator("[data-tab]")).toHaveCount(2);

    // Always-on rain overlay (reference's signature buddy-room ambient).
    await expect(page.locator('canvas[data-overlay="rain"]')).toBeAttached();
  });

  test("shared agenda renders all 5 mocked items", async ({ page }) => {
    await page.goto(`/focus/${MATCH_ID}`);
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });
    const items = page
      .getByTestId("shared-agenda")
      .locator("[data-agenda-item]");
    await expect(items).toHaveCount(5);
  });
});

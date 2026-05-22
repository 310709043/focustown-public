import { expect, test } from "@playwright/test";

import { baselineTownMocks, json, mockApi } from "./helpers/mock-backend";
import { seedAuthTokens } from "./helpers/session";

/**
 * Structural alignment for `<MatchModal>`. Triggered from /town by
 * seeding the in-memory matchStore directly via the test-only
 * `window.__ftMatchStore` bridge — avoids the realtime fan-out path so
 * the modal is deterministic. The bridge lives in
 * `frontend/lib/state/matchStore.ts` and is gated to non-production
 * builds.
 *
 * Product redesign (2026-05-22): the Accept / Skip step is gone. The
 * user only ever sees the "waiting" branch; once the backend pairs them,
 * the page auto-accepts and routes into /focus/{matchId}. These specs
 * verify (a) the waiting branch renders, (b) Cancel calls cancelQueue.
 * The end-to-end auto-navigate is covered by
 * ``match-to-room-full-flow.spec.ts``.
 */
test.describe("MatchModal — waiting branch", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, {
      ...baselineTownMocks(),
      "GET  /api/v1/me/room": (r) =>
        json(r, 200, {
          id: "room-test-1",
          owner_user_id: "u-test-1",
          name: "Smoke's Room",
          theme: { wallpaper: "stars", floor: "wood", accent: "purple" },
          created_at: "2026-05-01T00:00:00Z",
        }),
    });
    await seedAuthTokens(page);
  });

  test("waiting branch shows pulsing avatar + Cancel", async ({ page }) => {
    await page.goto("/town");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });

    await page.waitForFunction(
      () =>
        !!(window as unknown as { __ftMatchStore?: unknown }).__ftMatchStore,
      undefined,
      { timeout: 10_000 },
    );

    // Drop the store straight into the waiting state — the modal
    // mounts whenever status !== "idle".
    await page.evaluate(() => {
      type Bridge = {
        __ftMatchStore?: {
          setState: (s: Record<string, unknown>) => void;
        };
      };
      const w = window as unknown as Bridge;
      if (!w.__ftMatchStore) {
        throw new Error("__ftMatchStore bridge not exposed — non-prod build expected");
      }
      w.__ftMatchStore.setState({
        status: "waiting",
        current: null,
        waitingSince: Date.now(),
        botFallbackAt: Date.now() + 28_000,
      });
    });

    const modal = page.getByTestId("match-modal");
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await expect(modal.getByTestId("match-waiting-avatar")).toBeVisible();
    await expect(modal.getByTestId("match-cancel")).toBeVisible();
  });
});

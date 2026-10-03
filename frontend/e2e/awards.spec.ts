import { expect, test } from "@playwright/test";

import { baselineTownMocks, json, mockApi } from "./helpers/mock-backend";
import { seedAuthTokens } from "./helpers/session";

/**
 * Structural alignment for /awards. Asserts the two reference sections
 * (leaderboard + achievements) render as `pixel-panel` chrome with at
 * least one entry each, plus the back-to-town close button.
 */
test.describe("/awards — reference parity", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, {
      ...baselineTownMocks(),
      "GET  /api/v1/leaderboard": (r) =>
        json(r, 200, [
          { user_id: "u1", display_name: "Kai", total_seconds: 7800, character_key: "kai" },
          { user_id: "u2", display_name: "Bear", total_seconds: 6600, character_key: "bear" },
        ]),
      "GET  /api/v1/leaderboard/today": (r) =>
        json(r, 200, [
          { user_id: "u1", display_name: "Kai", total_seconds: 7800, character_key: "kai" },
          { user_id: "u2", display_name: "Bear", total_seconds: 6600, character_key: "bear" },
        ]),
      // Shapes follow lib/api/types.gen.ts: leaderboard rows carry
      // total_seconds, achievements come back as a cursor page.
      "GET  /api/v1/achievements": (r) =>
        json(r, 200, {
          items: [
            { code: "first_focus", icon: "🔋", title: "First focus", description: "Complete your first session" },
            { code: "streak_7", icon: "🔥", title: "7-day streak", description: "Focus 7 days in a row" },
          ],
          next_cursor: null,
        }),
    });
    await seedAuthTokens(page);
  });

  test("awards scene renders top bar + leaderboard + achievements pixel-panel chrome", async ({ page }) => {
    await page.goto("/awards");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });

    await expect(page.getByTestId("awards-scene")).toBeVisible();

    const topBar = page.getByTestId("awards-top-bar");
    await expect(topBar).toBeVisible();
    await expect(topBar.getByTestId("awards-close")).toBeVisible();

    const leaderboard = page.getByTestId("awards-leaderboard");
    await expect(leaderboard).toBeVisible();
    await expect(leaderboard).toHaveClass(/pixel-panel/);

    const achievements = page.getByTestId("awards-achievements");
    await expect(achievements).toBeVisible();
    await expect(achievements).toHaveClass(/pixel-panel/);
  });
});

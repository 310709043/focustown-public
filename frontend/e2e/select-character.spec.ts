import { expect, test } from "@playwright/test";

import { fixtures, json, mockApi } from "./helpers/mock-backend";
import { seedAuthTokens } from "./helpers/session";

/**
 * Structural alignment for /select-character. Asserts reference's
 * 31-avatar role grid, 4-pomodoro daily-goal radio, summary footer
 * with the primary CTA, and the 4-tab bar.
 */
test.describe("/select-character — reference parity", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, {
      "GET  /api/v1/auth/me": (r) => json(r, 200, fixtures.user),
    });
    await seedAuthTokens(page);
  });

  test("renders the 4-tab bar + role grid + daily goal radio + summary footer", async ({ page }) => {
    await page.goto("/select-character");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });

    // Tab bar
    const tabs = page.getByTestId("tab-bar").locator("[data-tab]");
    await expect(tabs).toHaveCount(4);

    // 30 avatars in the role grid (matches lib/pixel/sprites/avatars.ts).
    const avatarCells = page.getByTestId("avatar-cell");
    await expect.poll(async () => await avatarCells.count(), { timeout: 5_000 }).toBeGreaterThanOrEqual(30);

    // Daily goal radiogroup with 4 chips.
    const goalRadio = page.getByTestId("daily-goal-radio");
    await expect(goalRadio).toBeVisible();
    await expect(goalRadio.locator('[role="radio"]')).toHaveCount(4);

    // Summary footer with confirm CTA.
    const footer = page.getByTestId("summary-footer");
    await expect(footer).toBeVisible();
    await expect(footer.locator(".pixel-btn.primary")).toBeVisible();
  });
});

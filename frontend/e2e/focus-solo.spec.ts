import { expect, test } from "@playwright/test";

import { baselineTownMocks, fixtures, json, mockApi } from "./helpers/mock-backend";
import { seedAuthTokens } from "./helpers/session";

/**
 * Structural alignment for /focus/solo (Solo focus room). Asserts the
 * reference layout: ambient cycle indicator, 7-panel right rail, wide
 * notes left column. The ambient cycle is locked to `day` via
 * `localStorage.focustown.ambient.lock` so assertions don't flake on
 * the 90 s rAF cycle.
 */
test.describe("/focus/solo — reference parity", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, {
      ...baselineTownMocks(),
      "GET  /api/v1/friends/focusing-now": (r) => json(r, 200, { friends_focusing: [] }),
      "GET  /api/v1/notes": (r) => json(r, 200, []),
    });
    await seedAuthTokens(page);
    // Lock the ambient cycle BEFORE navigating so the store reads it on init.
    await page.evaluate(() =>
      window.localStorage.setItem("focustown.ambient.lock", "day"),
    );
  });

  test("solo scene mounts all 7 reference panels in the right rail", async ({ page }) => {
    await page.goto("/focus/solo");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });

    // Scene shell
    await expect(page.getByTestId("focus-solo-scene")).toBeVisible();
    await expect(page.getByTestId("focus-top-bar")).toBeVisible();
    await expect(page.getByTestId("solo-env-indicator")).toBeVisible();
    await expect(page.getByTestId("solo-env-indicator")).toContainText("AUTO");

    // Notes wide-left
    await expect(page.getByTestId("notes-panel")).toBeVisible();
    await expect(page.getByTestId("solo-notes")).toBeVisible();

    // Right rail — 7 panels in reference order
    const rail = page.getByTestId("solo-right-rail");
    await expect(rail).toBeVisible();
    await expect(rail.getByTestId("big-timer")).toBeVisible();
    await expect(rail.getByTestId("session-insight")).toBeVisible();
    await expect(rail.getByTestId("friends-now")).toBeVisible();
    await expect(rail.getByTestId("tasks-panel")).toBeVisible();
    await expect(rail.getByTestId("sound-mixer")).toBeVisible();
    await expect(rail.getByTestId("next-env-card")).toBeVisible();
    await expect(rail.getByTestId("quick-actions")).toBeVisible();
  });

  test("BigTimer renders the 3 reference controls", async ({ page }) => {
    await page.goto("/focus/solo");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });
    const timer = page.getByTestId("big-timer");
    await expect(timer.getByTestId("timer-reset")).toBeVisible();
    await expect(timer.getByTestId("timer-toggle")).toBeVisible();
    await expect(timer.getByTestId("timer-skip")).toBeVisible();
  });

  test("SessionInsight has 4 progress chips", async ({ page }) => {
    await page.goto("/focus/solo");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });
    const chips = page.getByTestId("session-insight").getByTestId("progress-chip");
    await expect(chips).toHaveCount(4);
  });

  test("SoundMixer has 4 sliders", async ({ page }) => {
    await page.goto("/focus/solo");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });
    const sliders = page
      .getByTestId("sound-mixer")
      .locator('input[type="range"]');
    await expect(sliders).toHaveCount(4);
  });

  test("QuickActions has 3 buttons", async ({ page }) => {
    await page.goto("/focus/solo");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });
    const buttons = page
      .getByTestId("quick-actions")
      .locator("button.pixel-btn");
    await expect(buttons).toHaveCount(3);
  });

  test("NextEnvCard renders the next env emoji + 4-cell timeline", async ({ page }) => {
    await page.goto("/focus/solo");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });
    const card = page.getByTestId("next-env-card");
    await expect(card).toBeVisible();
    await expect(card.locator("[data-next-env-emoji]")).toBeVisible();
    const timelineCells = card
      .getByTestId("next-env-timeline")
      .locator("[data-timeline-slot]");
    await expect(timelineCells).toHaveCount(4);
  });
});

// Avoid an unused-import warning when fixtures is reserved for future
// tests but not used in the current asserts.
void fixtures;

import { expect, test } from "@playwright/test";

import { baselineTownMocks, json, mockApi } from "./helpers/mock-backend";
import { seedAuthTokens } from "./helpers/session";

test.describe("/town navigation", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, {
      ...baselineTownMocks(),
      "GET  /api/v1/me/room": (r) => json(r, 200, {
        id: "room-test-1",
        owner_user_id: "u-test-1",
        name: "Smoke's Room",
        theme: { wallpaper: "stars", floor: "wood", accent: "purple" },
        created_at: "2026-05-01T00:00:00Z",
      }),
    });
    await seedAuthTokens(page);
  });

  test("/town renders and HUD links are wired", async ({ page }) => {
    await page.goto("/town");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });
    await expect(page.getByTestId("town-top-hud")).toBeVisible();
    await expect(page.getByTestId("nav-awards")).toBeVisible();
    await expect(page.getByTestId("nav-shop")).toBeVisible();
    await expect(page.getByTestId("nav-friends")).toBeVisible();
    await expect(page.getByTestId("nav-logout")).toBeVisible();
  });

  test("/town shows reference scene chrome: weather badge, sky window, ticker bars, NPCs, buildings", async ({ page }) => {
    await page.goto("/town");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });

    await expect(page.getByTestId("weather-badge")).toBeVisible();
    await expect(page.getByTestId("sky-window")).toBeVisible();
    await expect(page.getByTestId("ticker-bar")).toHaveCount(2);

    // Named buildings — 10 in the foreground row.
    const buildings = page
      .getByTestId("named-buildings")
      .locator("[data-building]");
    await expect.poll(async () => await buildings.count()).toBeGreaterThan(0);

    // Scenery NPCs: 7 walkers + 2 cats + 3 cars + 3 birds.
    await expect.poll(async () => await page.getByTestId("named-walker").count()).toBe(7);
    await expect.poll(async () => await page.getByTestId("named-cat").count()).toBe(2);
    await expect.poll(async () => await page.getByTestId("named-car").count()).toBe(3);
    await expect.poll(async () => await page.getByTestId("named-bird").count()).toBe(3);
  });

  test("🏆 ACHV opens the awards modal", async ({ page }) => {
    await page.goto("/town");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });
    await page.getByTestId("nav-awards").click();
    await expect(page.getByTestId("achievements-modal")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("🛒 SHOP is disabled with coming-soon tooltip", async ({ page }) => {
    // Shop is a v1 stub (see memory: MVP-only stubs).  The nav-shop button
    // is intentionally disabled with a "Coming soon" tooltip; assert that
    // contract instead of trying to click a disabled button.
    await page.goto("/town");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });
    const shopBtn = page.getByTestId("nav-shop");
    await expect(shopBtn).toBeVisible();
    await expect(shopBtn).toBeDisabled();
    await expect(shopBtn).toHaveAttribute("title", /coming soon/i);
  });

  test("登出 clears tokens and returns to landing", async ({ page }) => {
    await page.goto("/town");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });
    await page.getByTestId("nav-logout").click();
    // Landing URL with localePrefix="always" is /zh-TW or /en, not bare "/".
    await expect(page).toHaveURL(/\/(zh-TW|en)\/?$/);
    const tokens = await page.evaluate(() =>
      window.localStorage.getItem("lowbatterytown.tokens"),
    );
    expect(tokens).toBeNull();
  });
});

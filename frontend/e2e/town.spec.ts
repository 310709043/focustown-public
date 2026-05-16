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

  test("🏆 ACHV opens the awards modal", async ({ page }) => {
    await page.goto("/town");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });
    await page.getByTestId("nav-awards").click();
    await expect(page.getByTestId("achievements-modal")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("🛒 SHOP opens the shop modal", async ({ page }) => {
    await page.goto("/town");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });
    await page.getByTestId("nav-shop").click();
    await expect(page.getByTestId("shop-modal")).toBeVisible({ timeout: 5_000 });
  });

  test("登出 clears tokens and returns to /", async ({ page }) => {
    await page.goto("/town");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });
    await page.getByTestId("nav-logout").click();
    await expect(page).toHaveURL("/");
    const tokens = await page.evaluate(() =>
      window.localStorage.getItem("focustown.tokens"),
    );
    expect(tokens).toBeNull();
  });
});

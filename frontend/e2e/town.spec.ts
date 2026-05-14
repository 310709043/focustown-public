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

  test("/town renders and navbar links are wired", async ({ page }) => {
    await page.goto("/town");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });
    await expect(page.getByTestId("town-navbar")).toBeVisible();
    await expect(page.getByTestId("nav-awards")).toBeVisible();
    await expect(page.getByTestId("nav-shop")).toBeVisible();
    await expect(page.getByTestId("nav-room")).toBeVisible();
    await expect(page.getByTestId("nav-logout")).toBeVisible();
  });

  test("🏆 大賞區 → /awards", async ({ page }) => {
    await page.goto("/town");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });
    await page.getByTestId("nav-awards").click();
    // Dev-server compile of the destination route can take a few seconds;
    // waitForURL is more tolerant than toHaveURL's default 5s assertion.
    await page.waitForURL(/\/awards$/, { timeout: 15_000 });
  });

  test("🛒 道具 → /shop", async ({ page }) => {
    await page.goto("/town");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });
    await page.getByTestId("nav-shop").click();
    await page.waitForURL(/\/shop$/, { timeout: 15_000 });
  });

  test("🏠 我的房間 → /town/room/[id]", async ({ page }) => {
    await page.goto("/town");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });
    await page.getByTestId("nav-room").click();
    await page.waitForURL(/\/town\/room\/room-test-1$/, { timeout: 15_000 });
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

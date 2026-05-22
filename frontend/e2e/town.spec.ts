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
    // nav-my-room + nav-shop intentionally hidden from the top bar
    // (TownTopHUD ``{false && ...}`` gate, 2026-05-21 UX request) until
    // V2 of the shop / room flows ship. The buttons + handlers + i18n
    // are kept in code so flipping the gate restores them.
    await expect(page.getByTestId("nav-friends")).toBeVisible();
    // Sign-out moved into the Profile modal (2026-05-21 UX request); the
    // top-bar nav-logout chip is gone. See profile.spec for the new entry
    // point via ``profile-sign-out``.
  });

  test("/town shows reference scene chrome: weather badge, sky window, NPCs, buildings", async ({ page }) => {
    await page.goto("/town");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });

    await expect(page.getByTestId("weather-badge")).toBeVisible();
    await expect(page.getByTestId("sky-window")).toBeVisible();
    // TickerBar removed in #83 (fix(phase9): remove TickerBar); the
    // pre-deletion assertion ``toHaveCount("ticker-bar", 2)`` lived
    // here and is now obsolete.

    // v2 SceneBackdrop replaces the old Sky+Clouds+CityBackground stack.
    await expect(page.getByTestId("scene-backdrop")).toBeVisible();

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

  test.skip("🛒 SHOP is disabled with coming-soon tooltip", async ({ page }) => {
    // nav-shop is currently hidden behind the same ``{false && ...}``
    // gate that hides nav-my-room (TownTopHUD lines 195-221). When the
    // shop V2 flow ships and the gate flips back to ``true``, unskip
    // this assertion — the disabled-button + tooltip contract still
    // holds at the component level.
    await page.goto("/town");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });
    const shopBtn = page.getByTestId("nav-shop");
    await expect(shopBtn).toBeVisible();
    await expect(shopBtn).toBeDisabled();
    await expect(shopBtn).toHaveAttribute("title", /coming soon/i);
  });

  test("登出 clears tokens and returns to signin", async ({ page }) => {
    await page.goto("/town");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });
    // Sign-out now lives inside the Profile modal — open it via the
    // centre status pill and click profile-sign-out.
    await page.getByTestId("user-status-pill").click();
    await expect(page.getByTestId("profile-modal")).toBeVisible();
    await page.getByTestId("profile-sign-out").click();
    await expect(page).toHaveURL(/\/(zh-TW|en)\/signin\/?$/);
    const tokens = await page.evaluate(() =>
      window.localStorage.getItem("lowbatterytown.tokens"),
    );
    expect(tokens).toBeNull();
  });
});

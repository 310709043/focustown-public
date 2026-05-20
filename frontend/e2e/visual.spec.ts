import { expect, test } from "@playwright/test";
import type { Route } from "@playwright/test";

import { baselineTownMocks, err, json, mockApi } from "./helpers/mock-backend";
import { seedAuthTokens } from "./helpers/session";

/**
 * Shared unauthenticated mock — landing / signin / signup must render
 * with `auth/me` returning 401, otherwise the page handler treats the
 * test session as already-logged-in and the login-scene chrome / signin
 * form / signup form never appear (the first baseline capture produced
 * three identical "looks like /town" PNGs because of this).
 */
const UNAUTH_MOCKS = {
  "GET  /api/v1/auth/me": (r: Route) => err(r, 401, "unauthorized", "Not signed in"),
};

/**
 * Visual regression baselines for the 4 canonical pages.
 *
 * Captured at the canonical 924×540 viewport (see
 * docs/qa/canonical-reference-index.md). Animations and transitions are
 * disabled and a 3.5s settle wait is added so the async PNG sprite
 * slicing in lib/pixel/pngSprite.ts finishes before the screenshot.
 *
 * Tolerance: maxDiffPixelRatio: 0.02 — strict enough to catch real
 * regressions but lenient on sub-pixel anti-aliasing differences.
 *
 * To intentionally update baselines after a deliberate UI change:
 *   pnpm test:e2e -- visual.spec.ts --update-snapshots
 */

const VIEWPORT = { width: 924, height: 540 } as const;

const DISABLE_ANIMATIONS_CSS = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
  }
`;

const SETTLE_MS = 3500;
const SCREENSHOT_OPTS = { maxDiffPixelRatio: 0.02 } as const;

test.describe("visual regression — canonical pages @ 924×540", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
  });

  test("landing /zh-TW/", async ({ page }) => {
    await mockApi(page, UNAUTH_MOCKS);

    await page.goto("/zh-TW/");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });
    await page.addStyleTag({ content: DISABLE_ANIMATIONS_CSS });
    await page.waitForTimeout(SETTLE_MS);

    await expect(page).toHaveScreenshot(SCREENSHOT_OPTS);
  });

  test("town /zh-TW/town", async ({ page }) => {
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

    await page.goto("/zh-TW/town");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });
    await page.addStyleTag({ content: DISABLE_ANIMATIONS_CSS });
    await page.waitForTimeout(SETTLE_MS);

    await expect(page).toHaveScreenshot(SCREENSHOT_OPTS);
  });

  test("signin /zh-TW/signin", async ({ page }) => {
    await mockApi(page, UNAUTH_MOCKS);

    await page.goto("/zh-TW/signin");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });
    await page.addStyleTag({ content: DISABLE_ANIMATIONS_CSS });
    await page.waitForTimeout(SETTLE_MS);

    await expect(page).toHaveScreenshot(SCREENSHOT_OPTS);
  });

  test("signup /zh-TW/signup", async ({ page }) => {
    await mockApi(page, UNAUTH_MOCKS);

    await page.goto("/zh-TW/signup");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });
    await page.addStyleTag({ content: DISABLE_ANIMATIONS_CSS });
    await page.waitForTimeout(SETTLE_MS);

    await expect(page).toHaveScreenshot(SCREENSHOT_OPTS);
  });
});

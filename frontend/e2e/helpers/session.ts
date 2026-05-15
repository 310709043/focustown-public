import type { Page } from "@playwright/test";

import { fixtures } from "./mock-backend";

/**
 * Seeds `localStorage` with the same shape `tokenStore` in
 * `lib/api/client.ts` writes, so subsequent navigations think the
 * user is already authenticated. Must run BEFORE the page is loaded
 * (i.e. on `about:blank`), since localStorage is per-origin and
 * the dev server's origin only exists once a page from it loads.
 */
export async function seedAuthTokens(page: Page): Promise<void> {
  // Navigate first so localStorage is scoped to the dev server origin.
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ tokens }) => {
      window.localStorage.setItem("focustown.tokens", JSON.stringify(tokens));
      window.sessionStorage.setItem("ft.splash.seen", "1");
    },
    { tokens: fixtures.tokens },
  );
}

/** Wipe both the auth tokens and the splash flag — fresh-tab simulation. */
export async function clearSession(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
}

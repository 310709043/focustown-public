import { expect, test } from "@playwright/test";

import { baselineTownMocks, mockApi } from "./helpers/mock-backend";

test.describe("Public navigation", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, baselineTownMocks());
  });

  test("/ → click 新帳號註冊 → /signup", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });
    await page.getByTestId("signup-link").click();
    await expect(page).toHaveURL(/\/(zh-TW|en)\/signup\/?$/);
    await expect(page.getByTestId("signup-form")).toBeVisible();
  });

  test("/signin loads and links work", async ({ page }) => {
    await page.goto("/signin");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });
    await expect(page.getByTestId("signin-form")).toBeVisible();
    // Resolve link by href — locale-prefix-aware and immune to i18n text drift.
    const signupLink = page.locator('a[href$="/signup"]').first();
    await expect(signupLink).toBeVisible();
    await signupLink.click();
    await expect(page).toHaveURL(/\/(zh-TW|en)\/signup\/?$/);
  });

  test("/signin → /forgot-password is reachable", async ({ page }) => {
    await page.goto("/signin");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });
    const forgotLink = page.locator('a[href$="/forgot-password"]').first();
    await expect(forgotLink).toBeVisible();
    await forgotLink.click();
    await expect(page).toHaveURL(/\/(zh-TW|en)\/forgot-password\/?$/);
  });
});

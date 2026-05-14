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
    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByTestId("signup-form")).toBeVisible();
  });

  test("/signin loads and links work", async ({ page }) => {
    await page.goto("/signin");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });
    await expect(page.getByTestId("signin-form")).toBeVisible();
    // signin → signup
    await page.getByRole("link", { name: /立即註冊/ }).click();
    await expect(page).toHaveURL(/\/signup$/);
  });

  test("/signin → /forgot-password is reachable", async ({ page }) => {
    await page.goto("/signin");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });
    await page.getByRole("link", { name: /忘記密碼/ }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
  });
});

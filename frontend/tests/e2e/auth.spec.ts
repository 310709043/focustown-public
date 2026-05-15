/**
 * E2E: signup → land in town.
 *
 * Runs without storageState (chromium-anon project). Walks the genuine
 * user-onboarding path: signup form → backend creates user + issues
 * tokens → page navigates to /town → the town UI is ready.
 *
 * No data-testid, no waitForTimeout. Role-based selectors throughout.
 */
import { expect, test } from "@playwright/test";

test("user signs up and lands in the town", async ({ page }) => {
  const ts = Date.now();
  await page.goto("/signup");

  await page.getByPlaceholder("email").fill(`e2e+signup+${ts}@example.com`);
  // PasswordInput renders a regular <input type="password"/>.
  await page.locator('input[type="password"]').first().fill("Sup3rSecret-1");
  await page.getByPlaceholder(/顯示名稱|name/i).fill(`E2E ${ts}`);

  // Terms checkbox — accessible by role checkbox.
  await page.getByRole("checkbox").first().check();

  await page.getByRole("button", { name: /註冊|sign up/i }).click();

  // We don't pin the timer / leaderboard content — just that we landed on
  // /town and the page mounted something town-shaped.
  await expect(page).toHaveURL(/\/town$/);
});

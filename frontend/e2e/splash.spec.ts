import { expect, test } from "@playwright/test";

import { baselineTownMocks, mockApi } from "./helpers/mock-backend";

test.describe("SplashGate", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, baselineTownMocks());
  });

  test("disappears within 2.5 seconds on first visit", async ({ page }) => {
    await page.goto("/");
    // Splash may already have unmounted if `goto` had to wait through a slow
    // dev-server compile — that's fine. The user-visible contract is just
    // "splash does not stick around". A long timeout here is the assertion.
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 2500 });
  });

  test("sets sessionStorage flag after fade", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 2500 });
    const flag = await page.evaluate(() =>
      window.sessionStorage.getItem("ft.splash.seen"),
    );
    expect(flag).toBe("1");
  });

  test("subsequent reloads skip the splash quickly", async ({ page }) => {
    // First visit — establish flag.
    await page.goto("/");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 2500 });

    // Reload with the flag already set. The mount-only effect reads the
    // flag and immediately calls setVisible(false), so the splash should
    // unmount on the very next render — well before the boot-ceremony
    // timers would have fired.
    await page.reload();
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 1500 });
  });

  test("login form is reachable once splash clears", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 2500 });
    // Login form is present and the signup link is clickable.
    await expect(page.getByTestId("signin-form")).toBeVisible();
    await expect(page.getByTestId("signup-link")).toBeEnabled();
  });
});

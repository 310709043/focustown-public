import { expect, test } from "@playwright/test";

import { err, fixtures, json, mockApi } from "./helpers/mock-backend";

test.describe("Sign up", () => {
  test("happy path → /select-character + token stored", async ({ page }) => {
    await mockApi(page, {
      "POST /api/v1/auth/signup": (r) =>
        json(r, 200, { user: fixtures.user, tokens: fixtures.tokens }),
      // /select-character calls this on mount.
      "GET  /api/v1/auth/me": (r) => json(r, 200, fixtures.user),
    });

    await page.goto("/signup");
    // The splash overlay blocks pointer events until it unmounts.
    // Generous timeout: first page-load can take a few seconds in dev.
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });

    await page.getByTestId("signup-name").fill("Smoke User");
    await page.getByTestId("signup-email").fill("smoke@example.com");
    await page.getByTestId("signup-password").fill("Smoketest123");
    await page.getByTestId("signup-terms").check();
    await page.getByTestId("signup-submit").click();

    await expect(page).toHaveURL(/\/select-character$/, { timeout: 5000 });
    const tokens = await page.evaluate(() =>
      window.localStorage.getItem("focustown.tokens"),
    );
    expect(tokens).toContain("fake.access.token");
  });

  test("409 email-taken → backend error message shown, URL stays", async ({ page }) => {
    await mockApi(page, {
      "POST /api/v1/auth/signup": (r) =>
        err(r, 409, "email_taken", "此 email 已被使用"),
    });

    await page.goto("/signup");
    // The splash overlay blocks pointer events until it unmounts.
    // Generous timeout: first page-load can take a few seconds in dev.
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });

    await page.getByTestId("signup-name").fill("Smoke User");
    await page.getByTestId("signup-email").fill("taken@example.com");
    await page.getByTestId("signup-password").fill("Smoketest123");
    await page.getByTestId("signup-terms").check();
    await page.getByTestId("signup-submit").click();

    await expect(page.getByTestId("signup-error")).toContainText("已被使用");
    await expect(page).toHaveURL(/\/signup$/);
  });

  test("network down → friendly Chinese message (R-3)", async ({ page }) => {
    // Abort every API call so the browser sees TypeError just like
    // a real "backend at :8000 not running" scenario.
    await page.route("**/api/v1/**", (route) => route.abort("failed"));

    await page.goto("/signup");
    // The splash overlay blocks pointer events until it unmounts.
    // Generous timeout: first page-load can take a few seconds in dev.
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });

    await page.getByTestId("signup-name").fill("Smoke User");
    await page.getByTestId("signup-email").fill("smoke@example.com");
    await page.getByTestId("signup-password").fill("Smoketest123");
    await page.getByTestId("signup-terms").check();
    await page.getByTestId("signup-submit").click();

    await expect(page.getByTestId("signup-error")).toContainText(
      "無法連線到伺服器",
    );
  });
});

test.describe("Sign in", () => {
  test("happy path → /town", async ({ page }) => {
    await mockApi(page, {
      "POST /api/v1/auth/signin": (r) =>
        json(r, 200, { user: fixtures.user, tokens: fixtures.tokens }),
      "GET  /api/v1/auth/me": (r) => json(r, 200, fixtures.user),
      "GET  /api/v1/presence/street": (r) => json(r, 200, []),
      "GET  /api/v1/me/wallet": (r) => json(r, 200, []),
      "GET  /api/v1/me/items": (r) => json(r, 200, []),
      "GET  /api/v1/tracks": (r) => json(r, 200, []),
    });

    await page.goto("/");
    // The splash overlay blocks pointer events until it unmounts.
    // Generous timeout: first page-load can take a few seconds in dev.
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });

    await page.getByTestId("signin-email").fill("smoke@example.com");
    await page.getByTestId("signin-password").fill("Smoketest123");
    await page.getByTestId("signin-submit").click();

    await expect(page).toHaveURL(/\/town$/, { timeout: 5000 });
  });

  test("401 invalid credentials → error banner, URL stays", async ({ page }) => {
    await mockApi(page, {
      "POST /api/v1/auth/signin": (r) =>
        err(r, 401, "invalid_credentials", "帳號或密碼錯誤"),
    });

    await page.goto("/");
    // The splash overlay blocks pointer events until it unmounts.
    // Generous timeout: first page-load can take a few seconds in dev.
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });

    await page.getByTestId("signin-email").fill("smoke@example.com");
    await page.getByTestId("signin-password").fill("wrong-password");
    await page.getByTestId("signin-submit").click();

    await expect(page.getByTestId("signin-error")).toContainText("帳號或密碼");
    await expect(page).toHaveURL("/");
  });
});

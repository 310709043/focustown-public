import { expect, test } from "@playwright/test";

const api = process.env.PLAYWRIGHT_API_BASE_URL ?? "";
const password = process.env.PLAYWRIGHT_COMPANION_ADMIN_TOKEN;
test.skip(!password || api !== "http://127.0.0.1:8791", "disposable local Worker only");
test.use({ trace: "off", video: "off", screenshot: "off" });

test("late unauthorized dashboard responses cannot erase a login or end the new session", async ({ page }) => {
  const pending: Array<() => Promise<void>> = [];
  const seen = new Set<string>();
  await page.route(`${api}/api/v1/admin/lbt/**`, async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== "GET" || seen.has(path)) return route.continue();
    seen.add(path);
    const response = await route.fetch();
    if (response.status() !== 401 || path.endsWith("/overview")) return route.fulfill({ response });
    // Keep real unauthenticated responses in flight while the owner types/logs in.
    await new Promise<void>(resolve => pending.push(async () => {
      await route.fulfill({ response });
      resolve();
    }));
  });
  try {
    await page.goto(`${api}/admin`);
    await expect.poll(() => pending.length).toBe(4);
    const input = page.getByLabel("管理密碼", { exact: true });
    await input.fill(password!);
    await pending.shift()!();
    await page.getByRole("button", { name: "登入", exact: true }).click();
    await expect(page.getByRole("button", { name: "登出", exact: true })).toBeVisible();
    await Promise.all(pending.splice(0).map(release => release()));
    const refreshed = page.waitForResponse(`${api}/api/v1/admin/lbt/overview`);
    await page.getByRole("button", { name: "重新整理", exact: true }).click();
    expect((await refreshed).status()).toBe(200);
    await expect(page.getByRole("button", { name: "開始陪聊值班", exact: true })).toBeVisible();
  } finally {
    await Promise.allSettled(pending.splice(0).map(release => release()));
  }
});

test("a dashboard response arriving after logout cannot restore the private screen", async ({ page }) => {
  await page.goto(`${api}/admin`);
  await page.getByLabel("管理密碼", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await expect(page.getByRole("button", { name: "登出", exact: true })).toBeVisible();
  let release: (() => Promise<void>) | undefined;
  await page.route(`${api}/api/v1/admin/lbt/overview`, async route => {
    const response = await route.fetch();
    await new Promise<void>(resolve => { release = async () => {
      await route.fulfill({ response });
      resolve();
    }; });
  });
  try {
    await page.getByRole("button", { name: "重新整理", exact: true }).click();
    await expect.poll(() => Boolean(release)).toBe(true);
    await page.getByRole("button", { name: "登出", exact: true }).click();
    await expect(page.getByLabel("管理密碼", { exact: true })).toBeVisible();
    await release!(); release = undefined;
    await page.unroute(`${api}/api/v1/admin/lbt/overview`);
    // Let the released fetch finish painting before asserting that no private
    // content returned. Checking immediately after fulfilment races the DOM.
    await page.evaluate(() => new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    await expect(page.getByLabel("管理密碼", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "開始陪聊值班", exact: true })).toHaveCount(0);
    // Reload checks the real session cookie, through the browser that set it.
    await page.reload();
    await expect(page.getByLabel("管理密碼", { exact: true })).toBeVisible();
  } finally {
    await release?.();
  }
});

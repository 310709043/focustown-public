import { expect, test } from "@playwright/test";

// Exercise the actual demo flow: no guest sessions or production chats.
for (const locale of ["zh-TW", "en"] as const) {
  for (const viewport of [
    { width: 320, height: 568, minThread: 100 },
    { width: 360, height: 640, minThread: 150 },
    { width: 390, height: 844, minThread: 240 },
  ]) {
    test(`${locale} mobile ${viewport.width}×${viewport.height} keeps chat controls on screen`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(`/${locale}/demo?time=night&week=weekday`);
      const root = page.locator(".lbt");
      await expect(page.locator(".home-view")).toBeVisible();
      await expect(page.locator(".townscape")).toBeVisible();
      expect(await root.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect(await page.locator(".nickname-field input").evaluate(el =>
        Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
      await page.locator("#lbt-adult").check();
      await page.locator(".selection-card > .primary-button").click();
      await expect(page.locator(".chat-main")).toBeVisible();
      const composer = page.locator("#lbt-message");
      await expect(composer).toBeInViewport();
      await expect(page.locator(".composer button")).toBeInViewport();
      await expect(page.locator(".leave-button")).toBeInViewport();
      await expect(page.locator(".chat-bottom-actions button").last()).toBeInViewport();
      expect((await page.locator(".chat-messages").boundingBox())!.height).toBeGreaterThanOrEqual(viewport.minThread);
      expect(await root.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);

      await composer.fill(locale === "en" ? "A small-screen hello" : "小螢幕也能好好聊天");
      await page.locator(".composer button").click();
      await expect(page.locator(".message.me").last()).toContainText(locale === "en" ? "A small-screen hello" : "小螢幕也能好好聊天");
      await page.locator(".leave-button").click();
      await expect(page.locator(".end-view")).toBeVisible();
    });
  }
}

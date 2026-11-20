import { expect, test } from "@playwright/test";

test("the Android entrance stays on the free app surface in both languages", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/zh-TW/android?time=night");
  await expect(page.getByRole("button", { name: /走進小鎮/ })).toBeVisible();
  await expect(page.locator(".support-pill, .support-card, .stage-controls, .looks-phone")).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  const links = await page.locator(".footer-links a").evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("href")),
  );
  expect(links).toEqual([
    "/zh-TW/android/policies/privacy",
    "/zh-TW/android/policies/terms",
    "/zh-TW/android/policies/guidelines",
  ]);
  await page.locator(".footer-links").getByRole("link", { name: "社群守則" }).click();
  await expect(page.getByRole("heading", { name: "保護兒少" })).toBeVisible();
  await page.locator(".topbar .brand").click();
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/android$/);
  await expect(page.getByRole("button", { name: /Walk into town/ })).toBeVisible();
  await expect(page.locator(".support-pill, .support-card, .stage-controls, .looks-phone")).toHaveCount(0);
});

test("blocking is a separate choice and clears the demo transcript", async ({ page }) => {
  await page.goto("/zh-TW/demo?time=night");
  await page.getByRole("checkbox", { name: /年滿 18 歲/ }).check();
  await page.getByRole("button", { name: /走進小鎮/ }).click();
  await expect(page.locator(".message.other").first()).toBeVisible();
  await page.getByRole("button", { name: "封鎖對方", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "封鎖並離開？" });
  await expect(dialog).toContainText("不會封鎖任何真人或送出檢舉");
  await dialog.getByRole("button", { name: /封鎖並離開/ }).click();
  await expect(page.locator(".end-view")).toBeVisible();
  await expect(page.locator(".message")).toHaveCount(0);
});

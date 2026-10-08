import { expect, test } from "@playwright/test";

test("day/weekend and night select different scenery; mobile sky topics become chat openers", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/zh-TW/demo?time=day&week=weekend");
  await expect(page.locator("html")).toHaveAttribute("data-lbt-time", "day");
  await expect(page.locator("html")).toHaveAttribute("data-lbt-week", "weekend");
  await expect(page.locator(".tw-weekend").first()).toBeVisible();
  // The current compact phone layout uses a sky and topic line, not the street.
  await page.setViewportSize({ width: 390, height: 844 });
  const topic = page.locator(".sky-line button");
  await expect(topic).toBeVisible();
  const word = await topic.locator("b").innerText();
  await topic.click();
  await expect(page.locator(".sky-line-taken")).toContainText(word);
  await page.getByRole("checkbox", { name: /我已年滿 18 歲/ }).check();
  await page.getByRole("button", { name: /走進小鎮/ }).click();
  await expect(page.locator(".sky-topic-card")).toContainText(word, { timeout: 10_000 });
  await page.locator(".sky-topic-card").getByRole("button", { name: "放進輸入框", exact: true }).click();
  await expect(page.getByLabel("輸入訊息", { exact: true })).toHaveValue(new RegExp(word));
  await page.getByRole("button", { name: /說聲晚安/ }).click();
  await page.goto("/zh-TW/demo?time=night&week=weekday");
  await expect(page.locator("html")).toHaveAttribute("data-lbt-time", "night");
  await expect(page.locator("html")).toHaveAttribute("data-lbt-week", "weekday");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator(".tw-weekday").first()).toBeVisible();
  await expect(page.locator(".tw-weekend").first()).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.locator(".lbt").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
});

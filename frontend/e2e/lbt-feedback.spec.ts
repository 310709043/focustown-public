import { expect, test } from "@playwright/test";

/**
 * Feedback box from the footer. The API is intercepted, so this needs no
 * backend; edge/test/feedback.test.ts covers the server side.
 */

test("sends feedback with an optional reply e-mail", async ({ page }) => {
  let sent: Record<string, unknown> | null = null;
  await page.route("**/api/v1/lbt/feedback", async (route) => {
    sent = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 201, contentType: "application/json", body: '{"id":"f1"}' });
  });
  await page.goto("/zh-TW/demo");
  await page.getByRole("button", { name: "意見箱" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "想跟小鎮說什麼？" })).toBeVisible();
  await dialog.getByLabel("問題回報").check();
  await dialog.getByLabel("內容").fill("等待畫面可以有音樂嗎");
  await dialog.getByLabel("回覆信箱（選填）").fill("me@example.com");
  await dialog.getByRole("button", { name: /送出/ }).click();

  await expect(dialog.getByRole("heading", { name: "收到了，謝謝你" })).toBeVisible();
  expect(sent).toMatchObject({
    category: "bug",
    message: "等待畫面可以有音樂嗎",
    email: "me@example.com",
    website: "",
    page: "/zh-TW/demo",
    locale: "zh-TW",
  });
});

test("a refused submission keeps the text and says why", async ({ page }) => {
  await page.route("**/api/v1/lbt/feedback", (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      body: '{"error":{"code":"too_many_feedback","message":"too_many_feedback"}}',
    }),
  );
  await page.goto("/zh-TW/demo");
  await page.getByRole("button", { name: "意見箱" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("內容").fill("再一則");
  await dialog.getByRole("button", { name: /送出/ }).click();

  await expect(dialog.getByRole("alert")).toContainText("送出次數有點多");
  await expect(dialog.getByLabel("內容")).toHaveValue("再一則");
});

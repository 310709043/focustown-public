import { expect, test } from "@playwright/test";

const api = process.env.PLAYWRIGHT_API_BASE_URL ?? "http://127.0.0.1:8791";
const password = process.env.PLAYWRIGHT_COMPANION_ADMIN_TOKEN;
test.skip(process.env.PLAYWRIGHT_REAL_STACK !== "1" || !password, "requires the disposable local acceptance stack");

test("the owner issues a six-month code; activation shows its deadline and unlocks the scene", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${api}/admin`);
  await page.getByLabel("管理密碼", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  const section = page.getByRole("region", { name: "解鎖碼", exact: true });
  await section.getByLabel("解鎖期限", { exact: true }).selectOption("6");
  await section.getByLabel("產生幾組", { exact: true }).fill("1");
  await section.getByLabel("備註", { exact: true }).fill("disposable campaign acceptance");
  await section.getByRole("button", { name: "產生解鎖碼", exact: true }).click();
  const fresh = section.locator(".unlock-fresh pre");
  await expect(fresh).toBeVisible();
  const code = (await fresh.innerText()).trim();
  await expect(section).toContainText("未啟用（啟用起六個月）");

  await page.goto("/zh-TW/unlock#code");
  await page.getByRole("textbox", { name: "解鎖碼", exact: true }).fill(code);
  await page.getByRole("button", { name: "解鎖", exact: true }).click();
  await expect(page.locator(".unlock-done")).toBeVisible();
  await expect(page.getByText(/活動場景可使用至/)).toContainText("不會自動扣款");
  await page.getByRole("link", { name: "回首頁", exact: true }).click();
  await expect(page.getByRole("radiogroup", { name: "舞台場景" })).toBeVisible();
});

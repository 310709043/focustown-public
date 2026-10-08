import { expect, test, type Page } from "@playwright/test";

const api = process.env.PLAYWRIGHT_API_BASE_URL ?? "";
const password = process.env.PLAYWRIGHT_COMPANION_ADMIN_TOKEN;
test.skip(!password || !/^http:\/\/127\.0\.0\.1:8791$/.test(api), "disposable local Worker only");
test.use({ trace: "off", video: "off", screenshot: "off" });
test.afterEach(async ({ browser }) => {
  await Promise.allSettled(browser.contexts().map(context => context.close()));
});

async function join(page: Page, name: string) {
  await page.goto("/zh-TW");
  await page.getByRole("textbox", { name: /這次想叫什麼/ }).fill(name);
  await page.getByRole("checkbox", { name: /我已年滿 18 歲/ }).check();
  await page.getByRole("button", { name: /走進小鎮/ }).click();
}
async function login(page: Page) {
  await page.goto(`${api}/admin`);
  await page.getByLabel("管理密碼", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await expect(page.getByRole("button", { name: "開始陪聊值班", exact: true })).toBeVisible();
}

test("mobile chat reconnects after a network drop; leaving and reloading never restores ended text", async ({ browser }) => {
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const desktop = await browser.newContext();
  const a = await mobile.newPage(), b = await desktop.newPage();
  await join(a, "手機驗收"); await join(b, "桌機驗收");
  await expect(a.locator(".partner-profile")).toContainText("桌機驗收");
  await a.getByLabel("輸入訊息", { exact: true }).fill("斷線前的測試訊息");
  await a.getByRole("button", { name: "送出訊息", exact: true }).click();
  await expect(b.locator(".message.other")).toContainText("斷線前的測試訊息");
  await a.getByLabel("輸入訊息", { exact: true }).fill("重新連線後也收到");
  await mobile.setOffline(true);
  await expect(a.locator(".chat-offline")).toBeVisible();
  await expect(a.getByRole("button", { name: "送出訊息", exact: true })).toBeDisabled();
  await a.getByLabel("輸入訊息", { exact: true }).press("Enter");
  await expect(a.getByLabel("輸入訊息", { exact: true })).toHaveValue("重新連線後也收到");
  await mobile.setOffline(false);
  await expect(a.getByRole("button", { name: "送出訊息", exact: true })).toBeEnabled({ timeout: 15_000 });
  await expect(a.locator(".message.me")).toHaveCount(1);
  await expect(a.getByLabel("輸入訊息", { exact: true })).toHaveValue("重新連線後也收到");
  await a.getByRole("button", { name: "送出訊息", exact: true }).click();
  await expect(b.locator(".message.other").last()).toContainText("重新連線後也收到");
  expect(await a.locator(".lbt").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await b.getByRole("button", { name: /說聲晚安/ }).click();
  await expect(a.locator(".end-view")).toBeVisible();
  await expect(a.locator(".message,.partner-profile")).toHaveCount(0);
  await a.reload();
  await expect(a.locator(".home-view")).toBeVisible();
  await expect(a.locator(".message,.partner-profile")).toHaveCount(0);
});

test("cancelling a real wait prevents a later visitor from pairing with the cancelled visitor", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await join(a, "先離開");
  await expect(a.locator(".waiting-view")).toBeVisible();
  await a.getByRole("button", { name: "先回到街口", exact: true }).click();
  await expect(a.locator(".home-view")).toBeVisible();
  await join(b, "稍後抵達");
  await expect(b.locator(".waiting-view")).toBeVisible();
  await expect.poll(async () => (await (await b.request.get(`${api}/api/v1/lbt/status`)).json()).waiting).toBe(1);
  await expect(a.locator(".chat-view")).toHaveCount(0);
  await b.getByRole("button", { name: "先回到街口", exact: true }).click();
});

test("mobile administrator takes over duty and the previous desktop loses duty", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await login(a);
  await a.getByRole("button", { name: "開始陪聊值班", exact: true }).click();
  await expect(a.getByText("值班中，等待你送出邀請。", { exact: true })).toBeVisible();
  await login(b);
  await b.getByRole("button", { name: "開始陪聊值班", exact: true }).click();
  await expect(b.getByText("值班中，等待你送出邀請。", { exact: true })).toBeVisible();
  await expect(a.getByText(/已在另一個視窗或裝置開始值班，這裡已停止/)).toBeVisible();
  await expect(a.getByRole("button", { name: "開始陪聊值班", exact: true })).toBeVisible();
  await b.getByRole("button", { name: "結束陪聊值班", exact: true }).click();
});

test("feedback reaches the real local database and can be reviewed without a Google Sheet", async ({ browser }) => {
  const visitor = await (await browser.newContext()).newPage();
  const admin = await (await browser.newContext()).newPage();
  const message = "本機功能驗收：意見可讀取與標記完成";
  await visitor.goto("/zh-TW");
  await visitor.getByRole("button", { name: "意見箱", exact: true }).click();
  const dialog = visitor.getByRole("dialog");
  await dialog.getByLabel("內容", { exact: true }).fill(message);
  await dialog.getByRole("button", { name: /送出/ }).click();
  await expect(dialog.getByRole("heading", { name: "收到了，謝謝你" })).toBeVisible();
  await login(admin);
  const card = admin.locator("article.report").filter({ hasText: message });
  await expect(card).toBeVisible();
  await expect(card).not.toContainText("已寫入試算表");
  await card.getByRole("button", { name: "標為「已處理」", exact: true }).click();
  await expect(card).toHaveCount(0);
});

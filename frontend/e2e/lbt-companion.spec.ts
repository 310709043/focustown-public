import { expect, test } from "@playwright/test";

// Opt-in against local wrangler or production. Admin credentials and reports
// must never enter retained traces, screenshots or videos.
const password = process.env.PLAYWRIGHT_COMPANION_ADMIN_TOKEN;
const api = process.env.PLAYWRIGHT_API_BASE_URL ?? "https://api.lowbatterytown.com";
test.skip(!password, "needs an explicitly supplied administrator test credential");
test.use({ trace: "off", video: "off", screenshot: "off" });

for (const [identity, nickname] of [["male", "小辟穀"], ["female", "打辟穀"]] as const) {
test(`${nickname}: host invites, visitor chooses, both chat and extend, then leave`, async ({ browser }) => {
  const adminContext = await browser.newContext(), visitorContext = await browser.newContext();
  const admin = await adminContext.newPage(), visitor = await visitorContext.newPage();
  try {
    await admin.goto(`${api}/admin`);
    await admin.getByLabel("管理密碼", { exact: true }).fill(password!);
    await admin.getByRole("button", { name: "登入", exact: true }).click();
    await admin.getByLabel("陪聊身分", { exact: true }).selectOption(identity);
    await admin.getByRole("button", { name: "開始陪聊值班" }).click();
    await expect(admin.getByText("值班中，等待你送出邀請。", { exact: true })).toBeVisible({ timeout: 15000 });
    await visitor.goto("/zh-TW");
    await visitor.getByRole("textbox", { name: /這次想叫什麼/ }).fill("陪聊驗收訪客");
    await visitor.getByRole("radio", { name: "有人聽我說", exact: true }).click();
    await visitor.getByRole("checkbox", { name: /我已年滿 18 歲/ }).check();
    await visitor.getByRole("button", { name: /走進小鎮/ }).click();
    await expect(visitor.getByRole("heading", { name: /等另一個人走過來/ })).toBeVisible();
    await admin.getByRole("button", { name: "邀請「陪聊驗收訪客」陪聊", exact: true }).click();
    await expect(visitor.getByRole("heading", { name: "有人願意陪你聊聊", exact: true })).toBeVisible();
    await expect(visitor.locator(".partner-profile")).toHaveCount(0);
    await visitor.getByRole("button", { name: "接受陪聊邀請", exact: true }).click();
    await expect(visitor.getByText(nickname, {exact:true})).toBeVisible();
    await expect(visitor.locator(".partner-profile")).toContainText(nickname);
    await expect(visitor.locator(".lbt")).not.toContainText("管理員");
    await expect(admin.getByLabel("陪聊身分", {exact:true})).toBeDisabled();
    await expect(admin.getByRole("heading", { name: "正在和「陪聊驗收訪客」聊天", exact: true })).toBeVisible();
    await admin.getByLabel("輸入陪聊訊息", { exact: true }).fill("測試：管理員真人訊息");
    await admin.getByRole("button", { name: "送出訊息", exact: true }).click();
    await expect(visitor.locator(".message.other .bubble").last()).toHaveText("測試：管理員真人訊息");
    await visitor.getByLabel("輸入訊息", { exact: true }).fill("測試：訪客回覆");
    await visitor.getByRole("button", { name: "送出訊息", exact: true }).click();
    await expect(admin.locator(".companion-line.partner").last()).toContainText("測試：訪客回覆");
    await admin.getByRole("button", { name: "再聊 7 分鐘（雙方同意）", exact: true }).click();
    await expect(visitor.locator(".extend-banner")).toContainText("對方想再聊 7 分鐘");
    await visitor.getByRole("button", { name: "我也想", exact: true }).click();
    await expect(visitor.locator(".session-timer")).toContainText(/^1[34]:/);
    const input = admin.getByLabel("輸入陪聊訊息", { exact: true });
    await input.fill("保留未送出的草稿");
    await admin.getByRole("button", { name: "重新整理", exact: true }).click();
    await expect(input).toHaveValue("保留未送出的草稿");
    await admin.getByRole("button", { name: "說聲晚安，結束陪聊", exact: true }).click();
    await expect(visitor.getByText("對方說了晚安。", { exact: true })).toBeVisible();
    await expect(visitor.locator(".message, .partner-profile")).toHaveCount(0);
    await expect(admin.locator(".companion-line")).toHaveCount(0);
    await expect(admin.getByRole("heading", { name: "正在和「陪聊驗收訪客」聊天", exact: true, includeHidden: true })).toHaveCount(0);
    await admin.getByRole("button", { name: "結束陪聊值班", exact: true }).click();
    await expect(admin.getByRole("button", { name: "開始陪聊值班", exact: true })).toBeVisible();
  } finally {
    await Promise.allSettled([adminContext.close(), visitorContext.close()]);
  }
});

}

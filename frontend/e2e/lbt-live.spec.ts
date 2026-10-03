import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * LowBatteryTown live flow: two real browsers against a real backend
 * (FastAPI + Redis + Postgres + worker). Opt-in, like the other full-stack
 * specs:
 *
 *   PLAYWRIGHT_REAL_STACK=1 pnpm playwright test e2e/lbt-live.spec.ts
 */
test.skip(!process.env.PLAYWRIGHT_REAL_STACK, "needs the real backend stack");

const HOME = "/zh-TW";

async function visitor(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(HOME);
  return page;
}

async function walkIn(
  page: Page,
  nickname: string,
  energy: RegExp,
  preference: string,
) {
  await page.getByRole("textbox", { name: /這次想叫什麼/ }).fill(nickname);
  await page.getByRole("radio", { name: energy }).click();
  await page.getByRole("radio", { name: preference }).click();
  await page.getByRole("checkbox", { name: /我已年滿 18 歲/ }).check();
  await page.getByRole("button", { name: /走進小鎮/ }).click();
}

test.describe.configure({ mode: "serial" });

test("two visitors are paired, chat, extend together and report", async ({ browser }) => {
  const a = await visitor(browser);
  const b = await visitor(browser);

  // Real head count: both pages hold a live connection.
  await expect(a.locator(".town-count")).toContainText(/此刻 \d+ 人在小鎮/, { timeout: 20_000 });

  await walkIn(a, "小橘", /快沒電了/, "有人聽我說");
  await expect(a.getByRole("heading", { name: /等另一個人走過來/ })).toBeVisible();
  await walkIn(b, "阿樹", /還有一點/, "聽聽別人的故事");

  // Each side sees the other's real nickname and battery, not a demo label.
  await expect(a.locator(".partner-profile h1")).toContainText("阿樹", { timeout: 10_000 });
  await expect(b.locator(".partner-profile h1")).toContainText("小橘");
  await expect(a.locator(".partner-details")).toContainText("還有一點");
  await expect(a.getByText("模擬對象")).toHaveCount(0);

  // Messages travel both ways, as plain text.
  await a.getByLabel("輸入訊息").fill("今天有點累，<b>但還是想來坐一下</b>");
  await a.getByRole("button", { name: "送出訊息" }).click();
  await expect(b.locator(".message.other .bubble").last()).toHaveText(
    "今天有點累，<b>但還是想來坐一下</b>",
  );
  await expect(b.locator(".message.other .bubble b")).toHaveCount(0);
  await b.getByLabel("輸入訊息").fill("我在聽，慢慢說就好。");
  await b.getByRole("button", { name: "送出訊息" }).click();
  await expect(a.locator(".message.other .bubble").last()).toHaveText("我在聽，慢慢說就好。");

  // Extending needs both: B asks, A sees the request and agrees.
  await b.locator(".extend-button").click();
  await expect(a.locator(".extend-banner")).toContainText("對方想再聊 7 分鐘");
  await a.getByRole("button", { name: "我也想" }).click();
  await expect(a.getByText("對方也願意留下")).toBeVisible();
  const clock = await a.locator(".session-timer").innerText();
  expect(Number(clock.split(":")[0])).toBeGreaterThanOrEqual(13);

  // A reports: the chat ends for both, and they are told different things.
  await a.getByRole("button", { name: "檢舉對話" }).click();
  const dialog = a.getByRole("dialog");
  await dialog.getByText("騷擾或辱罵").click();
  await dialog.getByRole("button", { name: /送出檢舉/ }).click();
  await expect(dialog).toContainText("謝謝你留意小鎮的安全");
  await expect(b.getByText("對方說了晚安。")).toBeVisible();
  await dialog.getByRole("button", { name: /知道了/ }).click();
  await expect(a.getByText(/謝謝你告訴我們/)).toBeVisible();

  // The reported pair is never paired again.
  await a.getByRole("button", { name: /再遇見一個人/ }).click();
  await b.getByRole("button", { name: /再遇見一個人/ }).click();
  await a.waitForTimeout(3000);
  await expect(a.getByRole("heading", { name: /等另一個人走過來/ })).toBeVisible();
  await expect(b.getByRole("heading", { name: /等另一個人走過來/ })).toBeVisible();

  await a.context().close();
  await b.context().close();
});

test("saying good night ends the chat for the partner", async ({ browser }) => {
  const a = await visitor(browser);
  const b = await visitor(browser);
  await walkIn(a, "晚風", /還有一點/, "隨意聊聊");
  await walkIn(b, "路燈", /想說說話/, "隨意聊聊");
  await expect(a.locator(".partner-profile h1")).toContainText("路燈", { timeout: 10_000 });

  await b.getByRole("button", { name: /說聲晚安/ }).click();

  await expect(b.getByText("你說了晚安。")).toBeVisible();
  await expect(a.getByText("對方說了晚安。")).toBeVisible();
  await a.context().close();
  await b.context().close();
});

test("a refresh mid-chat resumes the same conversation", async ({ browser }) => {
  const a = await visitor(browser);
  const b = await visitor(browser);
  await walkIn(a, "雨天", /快沒電了/, "隨意聊聊");
  await walkIn(b, "晴天", /快沒電了/, "隨意聊聊");
  await expect(a.locator(".partner-profile h1")).toContainText("晴天", { timeout: 10_000 });
  await a.getByLabel("輸入訊息").fill("等我一下");
  await a.getByRole("button", { name: "送出訊息" }).click();
  await expect(b.locator(".message.other .bubble").last()).toHaveText("等我一下");

  await a.reload();

  await expect(a.locator(".partner-profile h1")).toContainText("晴天", { timeout: 10_000 });
  await expect(a.locator(".message.me .bubble").last()).toHaveText("等我一下");
  await a.context().close();
  await b.context().close();
});

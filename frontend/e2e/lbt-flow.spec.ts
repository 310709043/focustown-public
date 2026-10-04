import { expect, test, type Page } from "@playwright/test";

/**
 * LowBatteryTown demo flow at /demo. No backend is involved: the partner is
 * the labelled script in lib/lbt/demoTransport.ts, so these tests need no
 * API mocks. The live flow against a real backend is lbt-live.spec.ts.
 */

const HOME = "/zh-TW/demo";

async function walkIn(page: Page) {
  await page.getByRole("checkbox", { name: /我已年滿 18 歲/ }).check();
  await page.getByRole("button", { name: /走進小鎮/ }).click();
}

async function enterChat(page: Page) {
  await page.goto(HOME);
  await walkIn(page);
  await expect(page.getByRole("heading", { name: /等另一個人走過來/ })).toBeVisible();
  await expect(page.getByLabel("輸入訊息")).toBeVisible({ timeout: 5000 });
}

test.describe("LowBatteryTown home", () => {
  test("the demo shows no head count it cannot back up", async ({ page }) => {
    await page.goto(HOME);
    await expect(page.getByRole("heading", { name: /今天還剩/ })).toBeVisible();
    await expect(page.locator(".town-count")).toHaveCount(0);
  });

  test("walking in needs the 18+ confirmation", async ({ page }) => {
    await page.goto(HOME);
    await page.getByRole("button", { name: /走進小鎮/ }).click();
    await expect(page.locator(".lbt-notice")).toContainText("年滿 18 歲");
  });

  test("shows the three social batteries and updates the battery face", async ({ page }) => {
    await page.goto(HOME);
    const radios = page.getByRole("radiogroup", { name: "選擇目前的社交電量" }).getByRole("radio");
    await expect(radios).toHaveCount(3);
    await expect(radios.nth(0)).toHaveAttribute("aria-checked", "true");

    const battery = page.locator(".battery-display");
    await expect(battery).toHaveAttribute("data-energy", "1");
    await radios.nth(2).click();
    await expect(battery).toHaveAttribute("data-energy", "3");
    await expect(page.getByRole("heading", { name: "有話想說，就說吧。" })).toBeVisible();
  });

  test("arrow keys move through the energy radios", async ({ page }) => {
    await page.goto(HOME);
    const radios = page.getByRole("radiogroup", { name: "選擇目前的社交電量" }).getByRole("radio");
    await radios.nth(0).focus();
    await page.keyboard.press("ArrowRight");
    await expect(radios.nth(1)).toHaveAttribute("aria-checked", "true");
    await expect(radios.nth(1)).toBeFocused();
  });

  test("has no horizontal overflow on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(HOME);
    const overflow = await page.evaluate(() => {
      const root = document.querySelector(".lbt") as HTMLElement;
      return root.scrollWidth - root.clientWidth;
    });
    expect(overflow).toBe(0);
  });

  test("switches to English", async ({ page }) => {
    await page.goto(HOME);
    await page.getByRole("button", { name: "EN" }).click();
    await expect(page).toHaveURL(/\/en\/demo$/);
    await expect(page.getByRole("button", { name: /Walk into town/ })).toBeVisible();
  });
});

test.describe("LowBatteryTown chat (simulated)", () => {
  test("labels the partner as simulated and shows both batteries", async ({ page }) => {
    await enterChat(page);
    await expect(page.getByText("模擬對象").first()).toBeVisible();
    await expect(page.locator(".self-profile")).toContainText("晚風旅人");
    await expect(page.locator(".self-profile")).toContainText("快沒電了");
    await expect(page.locator(".partner-details")).toContainText("還有一點");
    await expect(page.locator(".message.other").first()).toBeVisible({ timeout: 4000 });
  });

  test("renders typed text as plain text and gets a scripted reply", async ({ page }) => {
    await enterChat(page);
    const payload = '<img src=x onerror="window.__pwned=1">';
    await page.getByLabel("輸入訊息").fill(payload);
    await page.getByRole("button", { name: "送出訊息" }).click();

    const mine = page.locator(".message.me .bubble").last();
    await expect(mine).toHaveText(payload);
    await expect(page.locator(".message.me .bubble img")).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    await expect(page.locator(".message.me .message-sender").last()).toContainText("晚風旅人 · 你");
    await expect(page.locator(".message.other")).toHaveCount(2, { timeout: 5000 });
  });

  test("topic card goes into the composer", async ({ page }) => {
    await enterChat(page);
    await page.getByRole("button", { name: /抽一張話題卡/ }).click();
    const card = page.locator(".topic-card");
    await expect(card).toBeVisible();
    const text = (await card.locator("p").innerText()).trim();
    await page.getByRole("button", { name: "放進輸入框" }).click();
    await expect(card).toBeHidden();
    await expect(page.getByLabel("輸入訊息")).toHaveValue(text);
  });

  test("extending adds seven minutes once the other side agrees", async ({ page }) => {
    await enterChat(page);
    await page.locator(".extend-button").click();
    await expect(page.locator(".extend-button")).toBeDisabled();
    await expect(page.getByText("對方也願意留下")).toBeVisible({ timeout: 4000 });
    // 7:00 minus a couple of ticks, plus 7:00 → well above the original 7:00.
    const clock = await page.locator(".session-timer").innerText();
    const [m] = clock.split(":").map(Number);
    expect(m).toBeGreaterThanOrEqual(13);
  });

  test("saying good night leads to the end screen and back", async ({ page }) => {
    await enterChat(page);
    await page.getByRole("button", { name: /說聲晚安/ }).click();
    await expect(page.getByRole("heading", { name: /你已經很努力了/ })).toBeVisible();
    await page.getByRole("button", { name: /再遇見一個人/ }).click();
    await expect(page.getByRole("heading", { name: /等另一個人走過來/ })).toBeVisible();
    await expect(page.getByLabel("輸入訊息")).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: /說聲晚安/ }).click();
    await page.getByRole("button", { name: "回到小鎮入口" }).click();
    await expect(page.getByRole("heading", { name: /今天還剩/ })).toBeVisible();
  });

  test("cancelling the wait never opens a chat", async ({ page }) => {
    await page.goto(HOME);
    await walkIn(page);
    await page.getByRole("button", { name: "先回到街口" }).click();
    await page.waitForTimeout(3000);
    await expect(page.getByRole("heading", { name: /今天還剩/ })).toBeVisible();
    await expect(page.locator(".chat-view")).toHaveCount(0);
  });

  test("time up offers extend or good night and pauses the composer", async ({ page }) => {
    await page.clock.install();
    await page.goto(HOME);
    await walkIn(page);
    await page.clock.runFor(2300);
    await expect(page.getByLabel("輸入訊息")).toBeVisible();

    await page.clock.runFor(7 * 60 * 1000);
    const dialog = page.getByRole("dialog", { name: "時間到了" });
    await expect(dialog).toBeVisible();
    await expect(page.locator(".session-timer")).toHaveText("00:00");

    await dialog.getByRole("button", { name: "延長對話" }).click();
    await page.clock.runFor(1500);
    await expect(dialog).toBeHidden();
    await expect(page.locator(".session-timer")).toHaveText("07:00");
    await expect(page.getByLabel("輸入訊息")).toBeEnabled();
  });
});

test.describe("LowBatteryTown support dialog", () => {
  test("one-time support on the creator's page; nothing is charged here", async ({ page }) => {
    // Never leave the test environment: answer the external page locally.
    await page.context().route("https://buymeacoffee.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<title>support</title>" }),
    );
    await page.goto(HOME);
    await page.getByRole("button", { name: /贊助小鎮/ }).click();

    const dialog = page.getByRole("dialog", { name: "替小鎮點一盞燈" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("radio")).toHaveCount(0);
    await expect(dialog.locator(".support-total strong")).toHaveText("1 Power · US$3");
    await expect(dialog).toContainText("不自動續扣");
    await expect(dialog.getByRole("link", { name: /退款政策/ })).toHaveAttribute("target", "_blank");

    const popup = page.waitForEvent("popup");
    await dialog.getByRole("button", { name: /前往 Buy Me a Coffee 贊助/ }).click();
    expect((await popup).url()).toContain("buymeacoffee.com/lowbatterytown");
    await expect(dialog).toBeHidden();
  });

  test("Escape closes it and focus returns to the trigger", async ({ page }) => {
    await page.goto(HOME);
    const trigger = page.getByRole("button", { name: /贊助小鎮/ });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("Tab stays inside the dialog", async ({ page }) => {
    await page.goto(HOME);
    await page.getByRole("button", { name: /贊助小鎮/ }).click();
    const dialog = page.getByRole("dialog");
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press("Tab");
      const inside = await dialog.evaluate((node) => node.contains(document.activeElement));
      expect(inside).toBe(true);
    }
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press("Shift+Tab");
      const inside = await dialog.evaluate((node) => node.contains(document.activeElement));
      expect(inside).toBe(true);
    }
  });
});

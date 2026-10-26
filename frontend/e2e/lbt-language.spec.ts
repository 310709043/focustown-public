import { expect, test, type Page } from "@playwright/test";

test("English home and demo use English sky ideas, with an accessible language choice on mobile", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en/demo?time=night&week=weekday");
  await expect(page.getByTestId("lbt-intro")).toHaveCount(0);
  const language = page.getByRole("combobox", { name: "Chat language" });
  await expect(language).toHaveValue("en");
  await expect(page.locator(".carrier-neon b")).toContainText("?");
  await expect(page.locator(".carrier-neon b")).not.toContainText(/[\u4e00-\u9fff]/u);
  await page.screenshot({ path: info.outputPath("english-desktop.png"), fullPage: true, animations: "disabled" });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".sky-line button")).toBeVisible();
  expect(await page.locator(".lbt").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await language.focus();
  await expect(language).toBeFocused();
  // The browser owns native-select key handling; selectOption avoids
  // platform-specific popup behaviour in headless macOS and Linux.
  await language.selectOption("both");
  await expect(language).toHaveValue("both");
  await language.selectOption("en");
  await page.screenshot({ path: info.outputPath("english-mobile.png"), fullPage: true, animations: "disabled" });
  await expect(page.locator("#lbt-hero-title")).toContainText("bars are");

  await page.locator(".sky-line button").click();
  const taken = await page.locator(".sky-line-taken").innerText();
  expect(taken).not.toMatch(/[\u4e00-\u9fff]/u);
  await page.getByRole("checkbox", { name: "I am 18 or older" }).check();
  await page.getByRole("button", { name: /Walk into town/ }).click();
  await expect(page.locator(".partner-profile h1")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".sky-topic-card")).toBeVisible();
  await expect(page.locator(".sky-topic-card")).not.toContainText(/[\u4e00-\u9fff]/u);
});

async function englishWalkIn(page: Page, name: string, language = "en") {
  await page.goto("/en");
  await expect(page.getByTestId("lbt-intro")).toHaveCount(0);
  await page.getByRole("textbox", { name: /What should we call you/ }).fill(name);
  await page.getByRole("combobox", { name: "Chat language" }).selectOption(language);
  await page.getByRole("checkbox", { name: "I am 18 or older" }).check();
  await page.getByRole("button", { name: /Walk into town/ }).click();
}

test("English matches English or an explicit bilingual choice, never a Chinese-only waiter", async ({ browser }, info) => {
  test.skip(!process.env.PLAYWRIGHT_REAL_STACK, "needs the real Worker");
  const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext()));
  try {
    const [chinese, a, b] = await Promise.all(contexts.map(context => context.newPage()));
    await englishWalkIn(chinese, "Chinese only", "zh-TW");
    await englishWalkIn(a, "Night Owl");
    await expect(a.locator(".waiting-town")).toContainText("English");
    await expect(chinese.locator(".waiting-card")).toBeVisible();

    await englishWalkIn(b, "Moon");
    await expect(a.locator(".partner-profile .tag-name")).toHaveText("Moon", { timeout: 10_000 });
    await expect(b.locator(".partner-profile .tag-name")).toHaveText("Night Owl");
    await expect(a.locator(".system-note.is-met")).toContainText("Chat language: English");
    await expect(chinese.locator(".waiting-card")).toBeVisible();
    await a.getByLabel("Type a message").fill("Long day. How about you?");
    await a.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(b.locator(".message.other .bubble").last()).toHaveText("Long day. How about you?");
    await b.getByLabel("Type a message").fill("Same here. Taking it slow.");
    await b.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(a.locator(".message.other .bubble").last()).toHaveText("Same here. Taking it slow.");
    await a.reload();
    await expect(a.locator(".partner-profile .tag-name")).toHaveText("Moon", { timeout: 10_000 });
    await expect(a.locator(".message.other .bubble").last()).toHaveText("Same here. Taking it slow.");
    await a.screenshot({ path: info.outputPath("english-real-chat.png"), fullPage: true, animations: "disabled" });
    await a.getByRole("button", { name: "Say good night", exact: true }).click();
    await expect(b.locator(".end-view")).toBeVisible();

    // Re-enter with the language restored by the matched snapshot.
    await a.locator(".end-view .primary-button").click();
    await expect(a.locator(".waiting-town")).toContainText("English");
    await expect(chinese.locator(".waiting-card")).toBeVisible();
    await englishWalkIn(b, "Bilingual", "both");
    // The oldest waiter is Chinese; explicit bilingual consent can meet them.
    await expect(chinese.locator(".partner-profile .tag-name")).toHaveText("Bilingual", { timeout: 10_000 });
    await expect(b.locator(".system-note.is-met")).toContainText("Chat language: 中文");
    await expect(a.locator(".waiting-card")).toBeVisible();
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
});

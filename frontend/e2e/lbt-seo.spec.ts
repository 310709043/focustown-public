import { expect, test } from "@playwright/test";
import { ARTICLE_SLUGS } from "../lib/lbt/articles";

const origin = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.lowbatterytown.com").replace(/\/+$/, "");

for (const locale of ["zh-TW", "en"]) {
  test(`${locale}: brand short names describe the same public website`, async ({ page }) => {
    await page.goto(`/${locale}`);
    await expect(page.locator("footer")).toContainText("LowBattery");
    const entries = (await page.locator('script[type="application/ld+json"]').allTextContents())
      .flatMap((entry) => {
        const data = JSON.parse(entry);
        return data["@graph"] ?? [data];
      });
    for (const type of ["WebSite", "Organization", "WebApplication"]) {
      const entity = entries.find((entry) => entry["@type"] === type);
      expect(entity.name).toBe("LowBatteryTown");
      expect(entity.alternateName).toEqual(["低電量小鎮", "LowBattery", "低電量", "Low"]);
    }
    expect(entries.find((entry) => entry["@type"] === "WebSite").url).toBe(origin);
    await page.goto(`/${locale}/guide`);
    await expect(page.locator("main")).toContainText("LowBattery");
    await expect(page.locator("main")).toContainText("低電量");
    await expect(page.locator("main")).toContainText(locale === "zh-TW" ? "簡稱 LowBattery、低電量或 Low" : "also called LowBattery or Low");
  });

  test(`${locale}: public guide, canonical and language alternatives`, async ({ page, request }) => {
    const response = await request.get(`/${locale}/guide`);
    expect(response.ok()).toBeTruthy();
    // Essential answers are in the server HTML, before any JavaScript runs.
    expect(await response.text()).toContain(locale === "zh-TW" ? "匿名聊天指南" : "Anonymous Chat Guide");
    await page.goto(`/${locale}/guide`);
    await expect(page.locator("main h1")).toHaveCount(1);
    // Eight answers, then the links to the guide articles.
    await expect(page.locator("main section h2")).toHaveCount(9);
    await expect(page.locator('main .article-links a')).toHaveCount(ARTICLE_SLUGS.length);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${origin}/${locale}/guide`);
    for (const language of ["zh-TW", "en"]) {
      await expect(page.locator(`link[hreflang="${language}"]`)).toHaveAttribute("href", `${origin}/${language}/guide`);
    }
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", `${origin}/${locale}/guide`);
    await expect(page.locator("main")).toContainText("24");
    await expect(page.locator("main")).toContainText("180");
    await expect(page.locator("main")).toContainText("Buy Me a Coffee");
    await expect(page.locator("main")).not.toContainText(locale === "zh-TW" ? "目前不收款" : "payments are currently unavailable");
    // Validate structured data after rendering, not only from a fetch.
    const data = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(data.length).toBeGreaterThan(0);
    for (const entry of data) expect(() => JSON.parse(entry)).not.toThrow();
    expect(data.join("")).toContain('"FAQPage"');
  });

  test(`${locale}: meeting-people guides are discoverable and describe the actual service`, async ({ page, request }) => {
    for (const slug of ["anonymous-dating", "dating-app-or-chat"]) {
      const path = `/${locale}/guide/${slug}`;
      const response = await request.get(path);
      expect(response.status()).toBe(200);
      const html = await response.text();
      expect(html).toContain(locale === "zh-TW" ? "交友" : "dating");
      expect(html).toContain(locale === "zh-TW" ? "沒有好友名單" : "no friend list");
      await page.goto(path);
      await expect(page.locator("main h1")).toHaveCount(1);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${origin}${path}`);
      await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", `${origin}${path}`);
      await expect(page.locator('meta[name="robots"]')).not.toHaveAttribute("content", /noindex/);
      for (const language of ["zh-TW", "en"]) {
        await expect(page.locator(`link[hreflang="${language}"]`)).toHaveAttribute("href", `${origin}/${language}/guide/${slug}`);
      }
      await expect(page.locator("main")).not.toContainText("{reportDays}");
      const entries = (await page.locator('script[type="application/ld+json"]').allTextContents())
        .flatMap((entry) => JSON.parse(entry)["@graph"] ?? []);
      const article = entries.find((entry) => entry["@type"] === "Article");
      expect(article.mainEntityOfPage).toBe(`${origin}${path}`);
      expect(article.headline).toBe(await page.locator("main h1").textContent());
      if (slug === "dating-app-or-chat") {
        await expect(page.locator("main")).toContainText(locale === "zh-TW" ? "匿名交友就是約砲、打砲嗎？" : "Does anonymous chat mean a hookup service?");
        await expect(page.locator("main")).toContainText(locale === "zh-TW" ? "18+ 是使用年齡門檻" : "18+ is an age requirement");
      }
      await page.goto(`/${locale}/guide`);
      await expect(page.locator(`main a[href="${path}"]`)).toHaveCount(1);
      expect(await (await request.get("/sitemap.xml")).text()).toContain(`${origin}${path}`);
    }
  });

  test(`${locale}: guide articles are indexable, server-rendered and linked`, async ({ page, request }) => {
    const path = `/${locale}/guide/social-battery`;
    const response = await request.get(path);
    expect(response.ok()).toBeTruthy();
    expect(await response.text()).toContain(locale === "zh-TW" ? "社交電量是什麼" : "What Is a Social Battery");
    await page.goto(path);
    await expect(page.locator("main h1")).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${origin}${path}`);
    await expect(page.locator('meta[name="robots"]')).not.toHaveAttribute("content", /noindex/);
    await expect(page.locator(`main a[href="/${locale}/guide"]`)).toHaveCount(1);
    await expect(page.locator("main .article-links a")).toHaveCount(ARTICLE_SLUGS.length - 1);
    const data = (await page.locator('script[type="application/ld+json"]').allTextContents()).join("");
    expect(data).toContain('"Article"');
    expect(data).toContain('"BreadcrumbList"');
    expect((await request.get(`/${locale}/guide/not-an-article`)).status()).toBe(404);
  });

  test(`${locale}: WooTalk guide is discoverable and clearly independent`, async ({ page, request }) => {
    const path = `/${locale}/guide/wootalk-alternative`;
    const response = await request.get(path);
    expect(response.ok()).toBeTruthy();
    const html = await response.text();
    expect(html).toContain("WooTalk");
    expect(html).toContain(locale === "zh-TW" ? "無合作、隸屬或官方關係" : "is not affiliated with");
    await page.goto(path);
    await expect(page.locator("main h1")).toHaveCount(1);
    await expect(page.locator("main h1")).toContainText("WooTalk");
    await expect(page.locator('meta[name="robots"]')).not.toHaveAttribute("content", /noindex/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${origin}${path}`);
    for (const language of ["zh-TW", "en"]) {
      await expect(page.locator(`link[hreflang="${language}"]`)).toHaveAttribute("href", `${origin}/${language}/guide/wootalk-alternative`);
    }
    await expect(page.locator('main a[href="https://wootalk.today/"]')).toHaveCount(1);
    await expect(page.locator("main")).toContainText("180");
    await expect(page.locator("main")).not.toContainText("{reportDays}");
    const scripts = await page.locator('script[type="application/ld+json"]').allTextContents();
    const graphs = scripts.flatMap((entry) => JSON.parse(entry)["@graph"] ?? []);
    const article = graphs.find((entry) => entry["@type"] === "Article");
    expect(article.mainEntityOfPage).toBe(`${origin}${path}`);
    expect(article.headline).toBe(await page.locator("main h1").textContent());
    const entry = page.getByRole("link", {
      name: locale === "zh-TW" ? "試試免費匿名聊天（18+）" : "Try free anonymous chat (18+)",
    });
    await expect(entry).toHaveAttribute("href", `/${locale}`);
    await entry.click();
    await expect(page).toHaveURL(new RegExp(`/${locale}$`));
    await page.goto(`/${locale}/guide`);
    await expect(page.locator(`main a[href="${path}"]`)).toHaveCount(1);
  });
}

test("home links to the guide and demo stays out of search", async ({ page, request }) => {
  await page.goto("/zh-TW");
  await expect(page.locator('footer a[href="/zh-TW/guide"]')).toHaveCount(1);
  await expect(page.locator('meta[name="description"]')).not.toHaveAttribute("content", /模擬|互動原型/);
  const homeData = (await page.locator('script[type="application/ld+json"]').allTextContents()).join("");
  expect(homeData).toContain('"WebApplication"');
  expect(homeData).not.toContain("aggregateRating");
  await page.goto("/zh-TW/demo");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  const sitemap = await request.get("/sitemap.xml");
  const xml = await sitemap.text();
  expect(xml).toContain(`${origin}/zh-TW/guide`);
  expect(xml).toContain(`${origin}/en/guide`);
  expect(xml).toContain(`${origin}/zh-TW/guide/cant-sleep`);
  for (const locale of ["zh-TW", "en"]) expect(xml).toContain(`${origin}/${locale}/guide/wootalk-alternative`);
  expect(xml).not.toContain("/demo");
  const robots = await request.get("/robots.txt");
  expect(await robots.text()).not.toContain("Disallow: /_next/");
});

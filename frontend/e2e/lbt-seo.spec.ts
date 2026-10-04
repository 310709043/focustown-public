import { expect, test } from "@playwright/test";

const origin = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.lowbatterytown.com").replace(/\/+$/, "");

for (const locale of ["zh-TW", "en"]) {
  test(`${locale}: public guide, canonical and language alternatives`, async ({ page, request }) => {
    const response = await request.get(`/${locale}/guide`);
    expect(response.ok()).toBeTruthy();
    // Essential answers are in the server HTML, before any JavaScript runs.
    expect(await response.text()).toContain(locale === "zh-TW" ? "匿名聊天指南" : "Anonymous Chat Guide");
    await page.goto(`/${locale}/guide`);
    await expect(page.locator("main h1")).toHaveCount(1);
    await expect(page.locator("main section h2")).toHaveCount(7);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${origin}/${locale}/guide`);
    for (const language of ["zh-TW", "en"]) {
      await expect(page.locator(`link[hreflang="${language}"]`)).toHaveAttribute("href", `${origin}/${language}/guide`);
    }
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", `${origin}/${locale}/guide`);
    await expect(page.locator("main")).toContainText("24");
    await expect(page.locator("main")).toContainText("180");
    // Validate structured data after rendering, not only from a fetch.
    const data = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(data.length).toBeGreaterThan(0);
    for (const entry of data) expect(() => JSON.parse(entry)).not.toThrow();
  });
}

test("home links to the guide and demo stays out of search", async ({ page, request }) => {
  await page.goto("/zh-TW");
  await expect(page.locator('footer a[href="/zh-TW/guide"]')).toHaveCount(1);
  await expect(page.locator('meta[name="description"]')).not.toHaveAttribute("content", /模擬|互動原型/);
  await page.goto("/zh-TW/demo");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  const sitemap = await request.get("/sitemap.xml");
  const xml = await sitemap.text();
  expect(xml).toContain(`${origin}/zh-TW/guide`);
  expect(xml).toContain(`${origin}/en/guide`);
  expect(xml).not.toContain("/demo");
  const robots = await request.get("/robots.txt");
  expect(await robots.text()).not.toContain("Disallow: /_next/");
});

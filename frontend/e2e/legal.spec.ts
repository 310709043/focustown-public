import { expect, test } from "@playwright/test";

const LEGAL_ROUTES = ["/legal/privacy", "/legal/terms", "/legal/refund"] as const;

/**
 * Structural alignment for /legal/{privacy,terms,refund}. Reference
 * doesn't ship a legal screen, but per CLAUDE.md "don't drop pages"
 * rule these routes apply the same pixel-panel + token chrome.
 */
test.describe("/legal — pixel-chrome parity", () => {
  for (const route of LEGAL_ROUTES) {
    test(`${route} renders legal-layout + doc-header + toc-sidebar with pixel-panel chrome`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });

      const layout = page.getByTestId("legal-layout");
      await expect(layout).toBeVisible();

      const article = page.getByTestId("legal-article");
      await expect(article).toHaveClass(/pixel-panel/);

      await expect(page.getByTestId("legal-doc-header")).toBeVisible();

      // TocSidebar is hidden below md breakpoint; emulate desktop default.
      const toc = page.getByTestId("toc-sidebar");
      await expect(toc).toBeVisible();
      // At least one TOC entry must render.
      const entries = toc.locator("[data-toc-entry]");
      await expect.poll(async () => await entries.count()).toBeGreaterThan(0);
    });
  }
});

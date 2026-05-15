/**
 * E2E: a user with sufficient T coins buys a car and then equips it.
 *
 * Setup is API-driven: we credit the fixture user via repeated focus-session
 * completions (each 30-min completion = 100 cT, so two completions are
 * enough for the 80-cT cheapest car twice over). No production test hook,
 * no DB writes from the spec.
 *
 * UI verification: shop's "購買" → "✓ 已擁有" transition, then the equip
 * button switches to "✓ 裝備中".
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

import { E2E_CONFIG } from "../../playwright.config";

type Meta = {
  id: string;
  email: string;
  password: string;
  tokens: { access_token: string; refresh_token: string };
};

const meta: Meta = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "..", "..", "playwright", ".auth", "user.meta.json"),
    "utf-8",
  ),
);

async function creditWallet(request: import("@playwright/test").APIRequestContext) {
  for (let i = 0; i < 2; i++) {
    const start = await request.post(
      `${E2E_CONFIG.API_BASE_URL}/api/v1/sessions`,
      {
        headers: { Authorization: `Bearer ${meta.tokens.access_token}` },
        data: { mode: "focus", duration_seconds: 1800 },
      },
    );
    expect(start.ok()).toBeTruthy();
    const session = (await start.json()) as { id: string };
    const complete = await request.post(
      `${E2E_CONFIG.API_BASE_URL}/api/v1/sessions/${session.id}/complete`,
      { headers: { Authorization: `Bearer ${meta.tokens.access_token}` } },
    );
    expect(complete.ok()).toBeTruthy();
  }
}

test("buy then equip a car", async ({ page, request }) => {
  await creditWallet(request);

  await page.goto("/shop");

  // Pick the first car category card with an active 購買 button. Role-based
  // query keeps us out of CSS-selector flake territory.
  const buyButtons = page.getByRole("button", { name: "購買" });
  const firstBuy = buyButtons.first();
  await expect(firstBuy).toBeVisible({ timeout: 10_000 });
  await firstBuy.click();

  // The owned indicator lives inside the same card.
  await expect(page.getByText("✓ 已擁有").first()).toBeVisible({ timeout: 5_000 });

  // After owning, the "購買" button is replaced by "👤 裝備" (cars only).
  const equipButton = page.getByRole("button", { name: /裝備$/ });
  await expect(equipButton.first()).toBeVisible();
  await equipButton.first().click();

  await expect(page.getByRole("button", { name: /✓ 裝備中/ }).first()).toBeVisible({
    timeout: 5_000,
  });
});

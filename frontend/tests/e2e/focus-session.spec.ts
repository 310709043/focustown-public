/**
 * E2E: complete a focus session via API, then UI reflects the credit.
 *
 * API-level seeding (per the best-practices contract): we create + complete
 * a session through the backend directly so we never have to wait 25
 * minutes for a real timer. The UI's job here is to render the post-credit
 * wallet badge, which is what we verify.
 *
 * Uses the storageState fixture user from global-setup.
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

test("completing a focus session credits the wallet and the UI reflects it", async ({
  page,
  request,
}) => {
  // 1. Create + complete a session through the backend.
  const start = await request.post(`${E2E_CONFIG.API_BASE_URL}/api/v1/sessions`, {
    headers: { Authorization: `Bearer ${meta.tokens.access_token}` },
    data: { mode: "focus", duration_seconds: 1800 },
  });
  expect(start.ok()).toBeTruthy();
  const session = (await start.json()) as { id: string };

  const complete = await request.post(
    `${E2E_CONFIG.API_BASE_URL}/api/v1/sessions/${session.id}/complete`,
    { headers: { Authorization: `Bearer ${meta.tokens.access_token}` } },
  );
  expect(complete.ok()).toBeTruthy();

  // 2. Open the shop page (which shows the wallet header) and verify the
  //    T-coin balance is non-zero. The CoinAwardService subscriber wires up
  //    in the backend lifespan, so a 30-min completion credits 100 cT.
  await page.goto("/shop");
  const balanceBadge = page.getByTitle("T 幣餘額");
  await expect(balanceBadge).toBeVisible();
  await expect(balanceBadge).not.toHaveText("💰 0.00 T", { timeout: 5_000 });
});

/**
 * Playwright global setup.
 *
 * Steps:
 *  1. Confirm the backend is reachable (the `webServer` block in
 *     playwright.config.ts already polls /healthz, so by the time this
 *     runs the backend should be up).
 *  2. Sign up a deterministic-but-unique e2e fixture user.
 *  3. Persist the signed-in localStorage into
 *     `playwright/.auth/user.json` so authed-project specs can `storageState`.
 *
 * We deliberately do not seed shop items / wallet balance here — specs
 * that need that state do it themselves (see shop-and-equip.spec.ts).
 * Setup that's required by every spec belongs in this file; spec-specific
 * setup stays in the spec.
 */
import { chromium, request as playwrightRequest } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import { E2E_CONFIG } from "../../playwright.config";

export default async function globalSetup() {
  const { API_BASE_URL, FRONTEND_BASE_URL } = E2E_CONFIG;

  // Unique email so re-runs against a persistent DB don't collide.
  const ts = Date.now();
  const email = `e2e+${ts}@example.com`;
  const password = "Sup3rSecret-e2e";
  const displayName = `E2E ${ts}`;

  const ctx = await playwrightRequest.newContext({ baseURL: API_BASE_URL });
  // The terms_version must match what the backend currently accepts. Reading
  // it from the running server keeps the spec robust against legal updates.
  // If the backend has no introspection for it, we hardcode to today's
  // accepted version from `frontend/lib/config/legal.ts`.
  const termsVersion = process.env.E2E_TERMS_VERSION || "2026-05-14";

  const signupRes = await ctx.post("/api/v1/auth/signup", {
    data: {
      email,
      password,
      display_name: displayName,
      terms_accepted: true,
      terms_version: termsVersion,
      marketing_opt_in: false,
    },
  });
  if (!signupRes.ok()) {
    throw new Error(
      `e2e global-setup: signup failed (${signupRes.status()}): ${await signupRes.text()}`,
    );
  }
  const { user, tokens } = (await signupRes.json()) as {
    user: { id: string; email: string };
    tokens: { access_token: string; refresh_token: string };
  };

  // Stand up a browser context, plant the tokens into localStorage, and dump
  // the storageState. Specs that depend on this user will start with a
  // pre-hydrated authStore.
  const browser = await chromium.launch();
  const browserCtx = await browser.newContext();
  const page = await browserCtx.newPage();
  await page.goto(FRONTEND_BASE_URL);
  await page.evaluate((tok) => {
    localStorage.setItem("focustown.tokens", JSON.stringify(tok));
  }, tokens);

  const authDir = path.join(__dirname, "..", "..", "playwright", ".auth");
  fs.mkdirSync(authDir, { recursive: true });
  const statePath = path.join(authDir, "user.json");
  await browserCtx.storageState({ path: statePath });
  await browser.close();
  await ctx.dispose();

  // Stash the fixture user + creds so specs can hit the API directly.
  fs.writeFileSync(
    path.join(authDir, "user.meta.json"),
    JSON.stringify({ id: user.id, email, password, tokens }, null, 2),
  );
}

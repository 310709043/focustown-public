/**
 * Playwright config — three specs against a real backend + frontend.
 *
 * Best-practice posture (locked by the plan):
 *  - `webServer` auto-starts both servers; `reuseExistingServer: true`
 *    outside CI so a developer can drive their own `docker compose` /
 *    `pnpm dev` and Playwright will piggyback.
 *  - `trace: "on-first-retry"` so flakes leave evidence without bloating
 *    disk on every green run.
 *  - `storageState` from `playwright/.auth/user.json` — populated once by
 *    `global-setup.ts` — lets authed specs skip the sign-up dance.
 *  - Chromium only by default; firefox/webkit available via `--project`.
 *  - In CI, `retries: 2` + `workers: 1` until the suite is proven stable.
 *
 * Ports default to docker-compose values (backend 8000, frontend 3000).
 * Override via env if your local stack runs on different ports (the
 * existing dev compose maps backend to 8001 on some machines).
 */
import { defineConfig, devices } from "@playwright/test";

// Defaults match the local docker compose, which maps backend → 8001
// (sql-chatbot occupies 8000 in shared environments). Override via env
// when running against a clean compose stack where backend is on 8000.
const API_BASE_URL =
  process.env.E2E_API_BASE_URL || "http://localhost:8001";
const FRONTEND_BASE_URL =
  process.env.E2E_FRONTEND_BASE_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["list"], ["html"]] : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: FRONTEND_BASE_URL,
    trace: "on-first-retry",
    actionTimeout: 10_000,
    extraHTTPHeaders: {
      // Used by global-setup + specs that hit the API directly.
      "content-type": "application/json",
    },
  },
  projects: [
    {
      name: "chromium-anon",
      testMatch: /auth\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium-authed",
      testIgnore: /auth\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/user.json",
      },
    },
  ],
  webServer: [
    {
      command: "echo 'expecting backend already running'; exit 0",
      url: `${API_BASE_URL}/healthz`,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: "pnpm dev",
      url: FRONTEND_BASE_URL,
      reuseExistingServer: true,
      timeout: 60_000,
      env: {
        NEXT_PUBLIC_API_BASE_URL: API_BASE_URL,
      },
    },
  ],
});

// Surfaced via tests/e2e/global-setup.ts so specs can read them.
export const E2E_CONFIG = { API_BASE_URL, FRONTEND_BASE_URL };

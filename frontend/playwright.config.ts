import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for FocusTown frontend E2E.
 *
 * All tests run against a mocked backend (page.route in helpers/mock-backend.ts)
 * so they don't depend on docker / postgres / redis. The webServer block
 * boots `next dev` automatically when running locally.
 *
 * On CI, the backend URL is still `localhost:8000` per next.config; since
 * the route mock intercepts every fetch, nothing actually hits port 8000.
 */
export default defineConfig({
  testDir: "./e2e",
  // Tests are sequential by default — Next.js dev compiles on demand and
  // parallel workers thrash the same compile cache, leading to false
  // timeouts. The full suite runs in well under a minute serially.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [["html"], ["list"]] : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_NO_SERVER
    ? undefined
    : {
        command: "pnpm dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});

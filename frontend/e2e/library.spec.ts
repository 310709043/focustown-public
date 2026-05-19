import { expect, test } from "@playwright/test";

import { baselineTownMocks, json, mockApi } from "./helpers/mock-backend";
import { seedAuthTokens } from "./helpers/session";

/**
 * Structural alignment for /town/library. Asserts the page shell,
 * mood-tabs tablist, and the track list rendering against a 3-track
 * fixture.
 */
test.describe("/town/library — reference parity", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, {
      ...baselineTownMocks(),
      "GET  /api/v1/tracks": (r) =>
        json(r, 200, [
          { id: "t1", title: "Lofi A", artist: "DJ A", mood: "lofi", file_size_bytes: 4_000_000, duration_seconds: 180 },
          { id: "t2", title: "Lofi B", artist: "DJ B", mood: "jazz", file_size_bytes: 5_000_000, duration_seconds: 200 },
          { id: "t3", title: "Lofi C", artist: "DJ C", mood: "ambient", file_size_bytes: 3_000_000, duration_seconds: 220 },
        ]),
      "GET  /api/v1/room/tracks": (r) => json(r, 200, []),
      "GET  /api/v1/me/room/tracks": (r) => json(r, 200, []),
    });
    await seedAuthTokens(page);
  });

  test("library page shows mood-tabs tablist + 3 track rows", async ({ page }) => {
    await page.goto("/town/library");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });

    await expect(page.getByTestId("library-page")).toBeVisible();

    const tabs = page.getByTestId("library-mood-tabs");
    await expect(tabs).toBeVisible();
    await expect(tabs).toHaveAttribute("role", "tablist");
    const tabButtons = tabs.locator('[role="tab"]');
    await expect(tabButtons).toHaveCount(5); // all / lofi / jazz / rain / ambient

    const list = page.getByTestId("track-list");
    await expect(list).toBeVisible();
    await expect(list.getByTestId("track-row")).toHaveCount(3);
  });
});

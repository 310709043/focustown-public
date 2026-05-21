import { expect, test } from "@playwright/test";

import { baselineTownMocks, fixtures, json, mockApi } from "./helpers/mock-backend";
import { seedAuthTokens } from "./helpers/session";

/**
 * Structural alignment for /focus/solo. Post-QA round-1 + 2026-05-21
 * cleanup:
 *   • Wide notes left column.
 *   • Right rail: BigTimer → TasksPanel (with today's-goal strip in
 *     header) → SessionInsight (rotating tips).
 *   • FloatingMusicPlayer anchored bottom-right of the whole viewport
 *     (sibling of the body grid, not inside the notes column).
 *
 * Removed: FriendsNow / SoundMixer / NextEnvCard panels and the
 * BigTimer skip button (timer must only pause + restart) in round-1;
 * the DND / Lock phone / Back-to-town QuickActions cluster on
 * 2026-05-21. The ambient cycle is locked to `day` via
 * `localStorage.lowbatterytown.ambient.lock` so assertions don't flake
 * on the 90 s rAF cycle.
 */
test.describe("/focus/solo — reference parity", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, {
      ...baselineTownMocks(),
      "GET  /api/v1/friends/focusing-now": (r) => json(r, 200, { friends_focusing: [] }),
      "GET  /api/v1/notes": (r) => json(r, 200, []),
    });
    await seedAuthTokens(page);
    // Lock the ambient cycle BEFORE navigating so the store reads it on init.
    await page.evaluate(() =>
      window.localStorage.setItem("lowbatterytown.ambient.lock", "day"),
    );
  });

  test("solo scene mounts the 4-panel right rail + lifted music player", async ({ page }) => {
    await page.goto("/focus/solo");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });

    // Scene shell
    await expect(page.getByTestId("focus-solo-scene")).toBeVisible();
    await expect(page.getByTestId("focus-top-bar")).toBeVisible();
    await expect(page.getByTestId("solo-env-indicator")).toBeVisible();
    await expect(page.getByTestId("solo-env-indicator")).toContainText("AUTO");

    // Notes wide-left
    await expect(page.getByTestId("notes-panel")).toBeVisible();
    await expect(page.getByTestId("solo-notes")).toBeVisible();

    // Right rail — 3 panels (QuickActions removed 2026-05-21)
    const rail = page.getByTestId("solo-right-rail");
    await expect(rail).toBeVisible();
    await expect(rail.getByTestId("big-timer")).toBeVisible();
    await expect(rail.getByTestId("tasks-panel")).toBeVisible();
    await expect(rail.getByTestId("session-insight")).toBeVisible();

    // Removed panels MUST NOT be present anywhere on the page.
    await expect(page.getByTestId("friends-now")).toHaveCount(0);
    await expect(page.getByTestId("sound-mixer")).toHaveCount(0);
    await expect(page.getByTestId("next-env-card")).toHaveCount(0);
    await expect(page.getByTestId("quick-actions")).toHaveCount(0);

    // Music player lives outside the notes column now — must be
    // mounted (either expanded or collapsed chrome) as a sibling of
    // the body grid.
    await expect(
      page
        .getByTestId("floating-music-player")
        .or(page.getByTestId("floating-music-toggle")),
    ).toBeAttached();
  });

  test("BigTimer only renders reset + play/pause (no fast-forward)", async ({ page }) => {
    await page.goto("/focus/solo");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });
    const timer = page.getByTestId("big-timer");
    await expect(timer.getByTestId("timer-reset")).toBeVisible();
    await expect(timer.getByTestId("timer-toggle")).toBeVisible();
    // Skip / fast-forward button removed in QA round 1.
    await expect(timer.getByTestId("timer-skip")).toHaveCount(0);
  });

  test("TasksPanel header shows the merged daily-goal strip (4 chips)", async ({ page }) => {
    await page.goto("/focus/solo");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });
    const chips = page.getByTestId("tasks-panel").getByTestId("progress-chip");
    await expect(chips).toHaveCount(4);
  });

});

// Avoid an unused-import warning when fixtures is reserved for future
// tests but not used in the current asserts.
void fixtures;

import { expect, test } from "@playwright/test";

import { fixtures, json, mockApi } from "./helpers/mock-backend";
import { seedAuthTokens } from "./helpers/session";

/**
 * Phase 7 (Lane B / Wave 2) — owner-side per-room playlist.
 *
 * Coverage: the `+ 加入房間` / `✓ 房間` toggle on `/town/library` correctly
 * round-trips through `POST /me/room/tracks`, and the persisted state is
 * still reflected after a full page reload (i.e. `GET /me/room/tracks`
 * returns the entry on subsequent loads).
 *
 * Backend is mocked per the existing harness convention (see
 * `e2e/helpers/mock-backend.ts`). The mock keeps a per-test `playlist`
 * array as state so reload-after-mutation queries return the new row.
 */

test.describe("Phase 7 — per-room playlist", () => {
  test("owner adds track → ✓ 房間 persists across reload", async ({ page }) => {
    const track = {
      id: "t-seed-1",
      title: "E2E Seed Track",
      artist: null,
      mood: "lofi",
      duration_ms: 60_000,
      content_type: "audio/mpeg",
      file_size_bytes: 1024,
      license: null,
      uploaded_by_user_id: "u-other",
      created_at: "2026-05-01T00:00:00Z",
    };

    // Stateful playlist captured by all handlers in this test.
    type Entry = {
      id: string;
      room_id: string;
      track_id: string;
      position: number;
      track: typeof track;
    };
    let playlist: Entry[] = [];

    await mockApi(page, {
      "GET  /api/v1/auth/me": (r) => json(r, 200, fixtures.user),
      "GET  /api/v1/tracks": (r) => json(r, 200, [track]),
      "GET  /api/v1/me/room/tracks": (r) => json(r, 200, playlist),
      "POST /api/v1/me/room/tracks": async (r) => {
        // Robust to the historic JSON.stringify-twice frontend bug in
        // older `roomTracksApi.add`: if the first parse yields a string,
        // unwrap once more.
        let body = JSON.parse(r.request().postData() ?? "{}");
        if (typeof body === "string") body = JSON.parse(body);
        const entry: Entry = {
          id: `rt-${playlist.length + 1}`,
          room_id: "room-test-1",
          track_id: body.track_id,
          position: playlist.length,
          track,
        };
        playlist = [...playlist, entry];
        await json(r, 201, entry);
      },
    });
    await seedAuthTokens(page);

    await page.goto("/town/library");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });

    // Resolve the row + toggle by testid + data-track-id; locale-agnostic
    // and immune to i18n copy drift in `+ 加入房間` / `Add to room`.
    const row = page.locator(
      '[data-testid="track-row"][data-track-id="t-seed-1"]',
    );
    await expect(row).toBeVisible({ timeout: 10_000 });
    const toggleBefore = row.getByTestId("track-room-toggle");
    await expect(toggleBefore).toBeVisible();
    await expect(toggleBefore).toHaveAttribute("aria-pressed", "false");

    await Promise.all([
      page.waitForResponse(
        (resp) =>
          resp.url().includes("/me/room/tracks") &&
          resp.request().method() === "POST",
      ),
      toggleBefore.click(),
    ]);

    // Optimistic UI: aria-pressed flips to true.
    await expect(toggleBefore).toHaveAttribute("aria-pressed", "true", {
      timeout: 5000,
    });

    // Reload: GET /me/room/tracks returns the persisted entry; the page
    // re-derives `inPlaylist` and renders the same toggle as pressed.
    await page.reload();
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });

    const rowReloaded = page.locator(
      '[data-testid="track-row"][data-track-id="t-seed-1"]',
    );
    await expect(rowReloaded).toBeVisible({ timeout: 10_000 });
    const toggleReloaded = rowReloaded.getByTestId("track-room-toggle");
    await expect(toggleReloaded).toHaveAttribute("aria-pressed", "true", {
      timeout: 5000,
    });
  });
});

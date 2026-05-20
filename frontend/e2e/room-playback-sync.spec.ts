import { expect, test } from "@playwright/test";

import { fixtures, json, mockApi } from "./helpers/mock-backend";
import { mockWs } from "./helpers/mock-ws";
import { seedAuthTokens } from "./helpers/session";

/**
 * Phase 2 Gap 2 — visitor room playback sync regression net.
 *
 * Goal: every time a future change touches `<SyncedRoomPlayer>` /
 * `useRoomPlaybackStore` / the `music.{play,pause,change}` WS handler,
 * this test guards the visitor-side mirror end-to-end.
 *
 * What we cover (structural, NOT pixel/audio offset):
 *  1. When the logged-in user visits a room owned by someone else,
 *     `<SyncedRoomPlayer>` renders (not `<PersonalRadio>`).
 *  2. With no current playback, the visitor panel shows "房間靜默中".
 *  3. A `music.play` WS frame on `room:{id}` flips it to "與房主同步".
 *  4. A `music.pause` WS frame after a play does not crash and keeps the
 *     panel mounted (proof that the store-vs-WS contract still holds).
 *
 * What we don't cover (out of scope for a structural net):
 *  - Actual audio buffer offset / sub-second sync precision — browsers
 *    in headless mode don't reliably decode <audio>; that's a manual
 *    two-browser smoke test in `docs/qa/v1-handoff.md`.
 *  - Track title lookup (depends on `roomPlaybackApi.getByRoom` resolving
 *    track metadata; covered by the hydrate path in roomPlaybackStore
 *    unit tests if any exist).
 */

const ROOM_ID = "room-other-1";
const OWNER_ID = "u-room-owner-not-me";
const VISITOR_ID = fixtures.user.id;
const TRACK_ID = "t-test-track-42";

const otherOwnersRoom = {
  id: ROOM_ID,
  owner_user_id: OWNER_ID, // NOT the logged-in user → visitor view
  name: "Some Other Room",
  theme: "night",
  visibility: "public",
  max_visitors: 5,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};

test.describe("Phase 2 Gap 2 — visitor room playback sync", () => {
  test("visitor sees SyncedRoomPlayer and reacts to music.play", async ({
    page,
  }) => {
    await mockApi(page, {
      "GET  /api/v1/auth/me": (r) => json(r, 200, fixtures.user),
      "GET  /api/v1/me/wallet": (r) => json(r, 200, []),
      "GET  /api/v1/me/items": (r) => json(r, 200, []),
      "GET  /api/v1/presence/street": (r) => json(r, 200, []),
      "GET  /api/v1/tracks": (r) => json(r, 200, []),
      "GET  /api/v1/me/room": (r) => json(r, 200, null),
      "GET  /api/v1/me/room/tracks": (r) => json(r, 200, []),
      "GET  /api/v1/shop": (r) => json(r, 200, []),
      // Visitor's view of someone else's room
      [`GET  /api/v1/rooms/${ROOM_ID}`]: (r) => json(r, 200, otherOwnersRoom),
      [`GET  /api/v1/rooms/${ROOM_ID}/items`]: (r) => json(r, 200, []),
      [`GET  /api/v1/rooms/${ROOM_ID}/visitors`]: (r) => json(r, 200, []),
      // No active playback at first → SyncedRoomPlayer should show "房間靜默中"
      [`GET  /api/v1/rooms/${ROOM_ID}/playback`]: (r) => json(r, 200, null),
      [`POST /api/v1/rooms/${ROOM_ID}/visit`]: (r) =>
        json(r, 201, {
          id: "rv-1",
          room_id: ROOM_ID,
          visitor_user_id: VISITOR_ID,
          joined_at: new Date().toISOString(),
        }),
      [`POST /api/v1/rooms/${ROOM_ID}/leave`]: (r) =>
        r.fulfill({ status: 204, body: "" }),
    });
    const ws = await mockWs(page);
    await seedAuthTokens(page);

    await page.goto(`/town/room/${ROOM_ID}`);
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });

    // Wait for the page's room subscription so WS pushes don't race.
    await ws.waitForJoin(`room:${ROOM_ID}`);

    // (1) Visitor view mounted — the "房間音樂" label appears on the
    //     SyncedRoomPlayer card. PersonalRadio's owner copy would NOT
    //     render this label when the user isn't the owner.
    const panel = page.getByText("房間音樂", { exact: false });
    await expect(panel.first()).toBeVisible({ timeout: 5000 });

    // (2) Empty playback state → "房間靜默中" copy is visible.
    await expect(page.getByText("房間靜默中").first()).toBeVisible();

    // (3) Push music.play → store flips isPlaying=true → "與房主同步"
    //     subtitle appears (the "muted" branch above renders "—" instead).
    await ws.push({
      type: "music.play",
      room_id: ROOM_ID,
      track_id: TRACK_ID,
      started_at_ms: Date.now(),
    });
    await expect(page.getByText("與房主同步").first()).toBeVisible({
      timeout: 5000,
    });

    // (4) Pause after a play must not unmount the panel. The store sets
    //     isPlaying=false but keeps trackId set, so the "與房主同步"
    //     subtitle stays (panel is no longer "muted" once a track loaded).
    await ws.push({
      type: "music.pause",
      room_id: ROOM_ID,
      paused_at_ms: Date.now(),
    });
    await expect(page.getByText("與房主同步").first()).toBeVisible();
  });
});

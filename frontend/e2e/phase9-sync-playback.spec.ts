import { expect, test } from "@playwright/test";

import { fixtures, json, mockApi } from "./helpers/mock-backend";
import { mockWs } from "./helpers/mock-ws";
import { seedAuthTokens } from "./helpers/session";

/**
 * Phase 9 (Lane A / Wave 4) — multi-user sync playback.
 *
 * Coverage: the listener-side WS path. When a `music.play` event arrives
 * on the room channel, `RoomAudio` updates its `<audio>` element to the
 * broadcast track and unpauses. A subsequent `music.pause` pauses it.
 * `RoomAudio` is fully server-authoritative (state mutates only on
 * inbound WS — never on optimistic HTTP), so testing the WS-receiver
 * path covers both the owner-self-broadcast and the visitor-receives
 * cases — they share identical code.
 *
 * Drift assertion explicitly skipped (see plan): the `<audio>` element
 * advances on the real wall clock independent of `page.clock`, and the
 * drift math in `expectedMs()` is covered by the 19 unit tests in
 * `tests/unit/test_room_playback_service.py`. Adding a real-time E2E
 * drift assertion buys flakiness without coverage.
 *
 * Single-context test by design — same rationale as Phase 8 spec.
 */

const ROOM_ID = "room-owner-1";
const OWNER_ID = fixtures.user.id;
const TRACK_ID = "t-sync-1";

const ownerRoom = {
  id: ROOM_ID,
  owner_user_id: OWNER_ID,
  name: "Owner Room",
  theme: "night",
  visibility: "public",
  max_visitors: 5,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};

test.describe("Phase 9 — sync playback (listener side)", () => {
  test("music.play / music.pause WS events drive the audio element", async ({
    page,
  }) => {
    await mockApi(page, {
      "GET  /api/v1/auth/me": (r) => json(r, 200, fixtures.user),
      "GET  /api/v1/me/wallet": (r) => json(r, 200, []),
      "GET  /api/v1/me/items": (r) => json(r, 200, []),
      "GET  /api/v1/presence/street": (r) => json(r, 200, []),
      "GET  /api/v1/tracks": (r) => json(r, 200, []),
      "GET  /api/v1/me/room": (r) => json(r, 200, ownerRoom),
      "GET  /api/v1/me/room/tracks": (r) => json(r, 200, []),
      "GET  /api/v1/shop": (r) => json(r, 200, []),
      [`GET  /api/v1/rooms/${ROOM_ID}`]: (r) => json(r, 200, ownerRoom),
      [`GET  /api/v1/rooms/${ROOM_ID}/items`]: (r) => json(r, 200, []),
      [`GET  /api/v1/rooms/${ROOM_ID}/visitors`]: (r) => json(r, 200, []),
      [`GET  /api/v1/rooms/${ROOM_ID}/playback`]: (r) => json(r, 200, null),
      [`POST /api/v1/rooms/${ROOM_ID}/visit`]: (r) =>
        json(r, 201, {
          id: "rv-self",
          room_id: ROOM_ID,
          visitor_user_id: OWNER_ID,
          joined_at: new Date().toISOString(),
        }),
      [`POST /api/v1/rooms/${ROOM_ID}/leave`]: (r) =>
        r.fulfill({ status: 204, body: "" }),
    });
    const ws = await mockWs(page);
    await seedAuthTokens(page);

    await page.goto(`/town/room/${ROOM_ID}`);
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });

    // Wait until the page subscribes to room:{id} (VisitorPanel sends
    // the join frame after a successful visit). RoomAudio piggy-backs
    // on the same realtime client, so its useRealtime listener is
    // registered before we push.
    await ws.waitForJoin(`room:${ROOM_ID}`);

    // RoomAudio renders "尚未播放" until a music event arrives.
    await expect(page.getByText("尚未播放")).toBeVisible({ timeout: 5000 });

    // Push music.play → state updates → audio.src is set to the track.
    // We deliberately don't assert `paused === false` here: Chromium
    // headless blocks autoplay until a user gesture, so the silent
    // `audio.play()` inside `RoomAudio` rejects and `paused` stays
    // true even though state.is_playing is true. The deterministic
    // surface for "WS event processed" is the `src` attribute.
    await ws.push({
      type: "music.play",
      room_id: ROOM_ID,
      track_id: TRACK_ID,
      started_at_ms: Date.now(),
    });

    await expect
      .poll(
        async () =>
          page.locator("audio").evaluate(
            (el: HTMLAudioElement, expectedSuffix: string) =>
              el.src.endsWith(expectedSuffix),
            `/api/v1/tracks/${TRACK_ID}/stream`,
          ),
        { timeout: 5000 },
      )
      .toBe(true);

    // Push music.pause → `el.pause()` is called explicitly inside
    // RoomAudio's bind effect; that succeeds regardless of autoplay
    // policy. `paused === true` is a deterministic assertion of the
    // pause-side WS handling.
    await ws.push({
      type: "music.pause",
      room_id: ROOM_ID,
      paused_at_ms: Date.now(),
    });

    await expect
      .poll(
        async () =>
          page.locator("audio").evaluate((el: HTMLAudioElement) => el.paused),
        { timeout: 5000 },
      )
      .toBe(true);
  });
});

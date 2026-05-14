import { expect, test } from "@playwright/test";

import { fixtures, json, mockApi } from "./helpers/mock-backend";
import { mockWs } from "./helpers/mock-ws";
import { seedAuthTokens } from "./helpers/session";

/**
 * Phase 8 (Lane A / Wave 3) — room visit/leave + visitor avatars.
 *
 * Coverage: when the owner is in their own room, an inbound
 * `room.visitor_joined` WS event causes `VisitorPanel` to render the
 * new visitor's truncated id; a subsequent `room.visitor_left` event
 * removes the avatar.
 *
 * Single-context test by design — `VisitorPanel` is purely a WS
 * receiver (the visit-side HTTP + join frame from `VisitorPanel.tsx`
 * are the *other* user's responsibility). The owner's panel only
 * needs to react to inbound broadcasts, so we mock the WS and push
 * frames directly.
 *
 * Selectors lean on the `title` attribute (`"{user_id}（加入於 ...）"`)
 * since the component has no `data-testid` and the avatar's text
 * content is just a 6-char shortened id.
 */

const ROOM_ID = "room-owner-1";
const OWNER_ID = fixtures.user.id; // logged-in user = room owner
const VISITOR_ID = "u-visitor-42";

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

test.describe("Phase 8 — visit / leave presence", () => {
  test("owner sees visitor avatar appear and disappear via WS events", async ({
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
      // Owner's own VisitorPanel still calls visit() on mount — accept
      // the request silently so the panel proceeds to send its join frame.
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

    // VisitorPanel sends a `{type:"join", room_id}` frame after a
    // successful visit() — wait for it before pushing inbound events,
    // otherwise we'd race the page's own subscription wiring.
    await ws.waitForJoin(`room:${ROOM_ID}`);

    // Initially no other visitors → VisitorPanel renders nothing.
    await expect(
      page.locator(`[title*="${VISITOR_ID}"]`),
    ).toHaveCount(0);

    // Push visitor_joined → VisitorPanel appends the avatar.
    await ws.push({
      type: "room.visitor_joined",
      room_id: ROOM_ID,
      user_id: VISITOR_ID,
      joined_at: "2026-05-15T12:34:56Z",
    });
    await expect(
      page.locator(`[title*="${VISITOR_ID}"]`),
    ).toBeVisible({ timeout: 5000 });

    // Push visitor_left → avatar removed.
    await ws.push({
      type: "room.visitor_left",
      room_id: ROOM_ID,
      user_id: VISITOR_ID,
    });
    await expect(
      page.locator(`[title*="${VISITOR_ID}"]`),
    ).toHaveCount(0, { timeout: 5000 });
  });
});

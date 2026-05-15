import { expect, test } from "@playwright/test";

import { fixtures, json, mockApi } from "./helpers/mock-backend";
import { seedAuthTokens } from "./helpers/session";

/**
 * Phase 5 (Lane A / Wave 2) — owner-side room decoration.
 *
 * Coverage: the owner moves a pre-existing decoration via drag, the move
 * round-trips through `PUT /me/room/items/{id}`, and the new position
 * survives a hard reload (subsequent `GET /rooms/{id}/items` returns
 * the updated x/y; the canvas renders the item there).
 *
 * Why we don't drive the toolbar palette here: `useUserItemsStore` is
 * hydrated by `/town`'s mount and reset on unmount (see
 * `app/town/page.tsx`). When Next.js navigates from `/town` to
 * `/town/room/[id]`, the store is empty by the time the toolbar mounts,
 * so the palette renders "還沒有可擺放的道具" — a real architectural
 * constraint, not a test-isolation issue. We sidestep by pre-seeding
 * the placed item via the GET mock and only exercising the move path.
 *
 * Drag coordinates are asserted with ±2% tolerance against the canvas
 * bounding box, matching DecorationItem.tsx's rounding behavior
 * (`Math.round(next.x)`).
 */

const ROOM_ID = "room-test-1";

const room = {
  id: ROOM_ID,
  owner_user_id: fixtures.user.id,
  name: "Smoke's Room",
  theme: "night",
  visibility: "public",
  max_visitors: 5,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};

test.describe("Phase 5 — room decoration", () => {
  test("owner drags item → new position persists across reload", async ({
    page,
  }) => {
    // Stateful placed item — closure-captured by GET + PUT mocks so the
    // reload-after-move read returns the updated coords.
    let placed = {
      id: "ri-1",
      room_id: ROOM_ID,
      user_item_id: "ui-1",
      x: 30,
      y: 30,
      z_index: 0,
      created_at: "2026-05-01T00:00:00Z",
      updated_at: "2026-05-01T00:00:00Z",
    };

    await mockApi(page, {
      "GET  /api/v1/auth/me": (r) => json(r, 200, fixtures.user),
      "GET  /api/v1/me/wallet": (r) => json(r, 200, []),
      "GET  /api/v1/me/items": (r) => json(r, 200, []),
      "GET  /api/v1/presence/street": (r) => json(r, 200, []),
      "GET  /api/v1/tracks": (r) => json(r, 200, []),
      "GET  /api/v1/me/room": (r) => json(r, 200, room),
      "GET  /api/v1/me/room/tracks": (r) => json(r, 200, []),
      "GET  /api/v1/shop": (r) => json(r, 200, []),
      [`GET  /api/v1/rooms/${ROOM_ID}`]: (r) => json(r, 200, room),
      [`GET  /api/v1/rooms/${ROOM_ID}/items`]: (r) => json(r, 200, [placed]),
      [`PUT  /api/v1/me/room/items/${placed.id}`]: async (r) => {
        const body = JSON.parse(r.request().postData() ?? "{}");
        placed = { ...placed, x: body.x, y: body.y };
        await json(r, 200, placed);
      },
    });
    await seedAuthTokens(page);

    await page.goto(`/town/room/${ROOM_ID}`);
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });

    // Item starts at (30, 30) as the read-only "裝飾" role.
    const itemReadOnly = page.getByRole("img", { name: "裝飾" });
    await expect(itemReadOnly).toBeVisible({ timeout: 5000 });

    // Enter edit mode → item becomes role="button" with the drag aria-label.
    const editToggle = page.getByRole("button", { name: /(編輯|完成)/ });
    await editToggle.click();
    const draggable = page.getByRole("button", { name: "拖動以重新擺放" });
    await expect(draggable).toBeVisible({ timeout: 5000 });

    // Find the canvas (the item's parent) so we can compute relative
    // pixel coordinates from x/y percentages.
    const canvasBox = await draggable.evaluate((el) => {
      const parent = el.parentElement;
      if (!parent) throw new Error("decoration item has no parent");
      const r = parent.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });

    const startX = canvasBox.x + canvasBox.width * 0.3;
    const startY = canvasBox.y + canvasBox.height * 0.3;
    const targetXPct = 70;
    const targetYPct = 65;
    const endX = canvasBox.x + (canvasBox.width * targetXPct) / 100;
    const endY = canvasBox.y + (canvasBox.height * targetYPct) / 100;

    // Native pointer-capture drag — multiple intermediate moves keep
    // React state and pointer-capture invariants happy.
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move((startX + endX) / 2, (startY + endY) / 2, { steps: 5 });
    await Promise.all([
      page.waitForResponse(
        (resp) =>
          resp.url().includes(`/me/room/items/${placed.id}`) &&
          resp.request().method() === "PUT",
      ),
      (async () => {
        await page.mouse.move(endX, endY, { steps: 5 });
        await page.mouse.up();
      })(),
    ]);

    // Mock now has placed.x / placed.y at the new percentages (with
    // DecorationItem's Math.round applied to the deltas).
    expect(Math.abs(placed.x - targetXPct)).toBeLessThanOrEqual(2);
    expect(Math.abs(placed.y - targetYPct)).toBeLessThanOrEqual(2);

    // Reload → GET returns the moved item; canvas re-renders it.
    await page.reload();
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });
    const itemReloaded = page.getByRole("img", { name: "裝飾" });
    await expect(itemReloaded).toBeVisible({ timeout: 5000 });
    const reloadedXY = await itemReloaded.evaluate((el) => {
      const style = (el as HTMLElement).style;
      return { left: style.left, top: style.top };
    });
    // left/top come back as "70%" / "65%" — compare numeric.
    expect(parseFloat(reloadedXY.left)).toBeCloseTo(targetXPct, 0);
    expect(parseFloat(reloadedXY.top)).toBeCloseTo(targetYPct, 0);
  });
});

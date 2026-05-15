import type { Page, WebSocketRoute } from "@playwright/test";

/**
 * WebSocket route mocking — the realtime companion to `mockApi`.
 *
 * Usage:
 *   const ws = await mockWs(page);
 *   await page.goto("/town/room/abc");
 *   await ws.waitForJoin("room:abc");           // optional sync point
 *   await ws.push({ type: "room.visitor_joined",
 *                   room_id: "abc",
 *                   user_id: "u-visitor",
 *                   joined_at: "2026-05-15T00:00:00Z" });
 *
 * The mock intercepts the page's WebSocket handshake to
 * `**\/api/v1/ws/**` and does NOT forward to a real server — every frame
 * the page sends is captured locally, and the test pushes inbound frames
 * imperatively via `push()`.
 *
 * Sent frames are accessible via `ws.sent` (array of parsed JSON) for
 * assertions. The page client sends `{ type: "join", room_id: "..." }`
 * after a successful HTTP visit (see `VisitorPanel.tsx`); `waitForJoin`
 * resolves when a matching frame arrives so the test can be certain the
 * subsequent `push()` won't race the subscription.
 */

export type MockWs = {
  /** Imperatively push an inbound frame to the page. */
  push(message: Record<string, unknown>): Promise<void>;
  /** Resolves once the page has sent a `{type:"join", room_id}` frame
   *  whose `room_id` matches the channel suffix after `room:`. Accepts
   *  the raw channel string (e.g. `"room:abc"`) for ergonomic parity
   *  with mockApi's keys. */
  waitForJoin(channel: string): Promise<void>;
  /** Every frame the page has sent so far, as parsed JSON. */
  sent: ReadonlyArray<Record<string, unknown>>;
};

export async function mockWs(page: Page): Promise<MockWs> {
  const sent: Record<string, unknown>[] = [];
  let activeRoute: WebSocketRoute | null = null;
  const joinResolvers = new Map<string, Array<() => void>>();

  await page.routeWebSocket(/\/api\/v1\/ws\//, (route) => {
    // Keep a handle on the active route so push() can target it. The
    // RealtimeClient reconnects with exponential backoff on close, so a
    // page reload during a test will create a new route — overwrite is
    // the right behavior.
    activeRoute = route;
    route.onMessage((raw) => {
      try {
        const parsed = JSON.parse(String(raw)) as Record<string, unknown>;
        sent.push(parsed);
        if (parsed.type === "join" && typeof parsed.room_id === "string") {
          const key = `room:${parsed.room_id}`;
          const waiters = joinResolvers.get(key);
          if (waiters) {
            for (const r of waiters) r();
            joinResolvers.delete(key);
          }
        }
      } catch {
        /* unparseable frames are dropped silently */
      }
    });
    // We don't call connectToServer() — every inbound frame is test-driven.
  });

  return {
    async push(message) {
      // The page may not have opened the socket yet (initial navigation
      // is still loading). Wait a few hundred ms for the route handler
      // to bind; this is bounded by Playwright's default action timeout.
      const start = Date.now();
      while (!activeRoute && Date.now() - start < 5000) {
        await page.waitForTimeout(50);
      }
      if (!activeRoute) {
        throw new Error("mockWs.push: page never opened the WebSocket");
      }
      activeRoute.send(JSON.stringify(message));
    },
    async waitForJoin(channel) {
      // Fast path: already sent.
      const already = sent.find(
        (m) => m.type === "join" && `room:${m.room_id as string}` === channel,
      );
      if (already) return;
      await new Promise<void>((resolve) => {
        const existing = joinResolvers.get(channel) ?? [];
        existing.push(resolve);
        joinResolvers.set(channel, existing);
        // Timeout safety so tests fail loud instead of hanging.
        setTimeout(() => {
          const waiters = joinResolvers.get(channel);
          if (!waiters) return;
          const idx = waiters.indexOf(resolve);
          if (idx >= 0) waiters.splice(idx, 1);
          resolve();
        }, 10_000);
      });
    },
    get sent() {
      return sent;
    },
  };
}

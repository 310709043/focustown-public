/**
 * SkyWindow — focus-broadcast pane on top of the town sky.
 *
 * Regression cover for the 2026-05-24 fix: removed the 5-row "Kai /
 * Bear / Aria / Panda / Doc" SAMPLE_ROWS fallback and the hardcoded
 * "2,847 LIVE ONLINE" string. Both must read from real sources now —
 * the leaderboard API and the presence store respectively.
 *
 * Worth testing:
 *  - Empty leaderboard renders the empty-state copy, not synthesized
 *    sample rows (so a brand-new deployment reads honestly).
 *  - Live online count flows from `usePresenceStore.byId` count, not
 *    a static 2847.
 *  - When the API does return rows, the rank board renders them in
 *    order with the right counts.
 *
 * NOT worth testing:
 *  - The CRT scanline overlay or signal bar pulse — pure visuals.
 *  - The ad/broadcast carousel cycling (covered by manual QA + e2e).
 */
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { SkyWindow } from "@/components/town/scene/SkyWindow";
import { usePresenceStore } from "@/lib/state/presenceStore";
import type { StreetUser } from "@/lib/api/types.gen";
import { server } from "@/tests/setup";
import { http, HttpResponse } from "msw";

vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/components/scene/BroadcastClipPlayer", () => ({
  BroadcastClipPlayer: () => null,
}));

function makeStreetUser(id: string): StreetUser {
  return {
    id,
    display_name: id,
    character_key: null,
    role_label: null,
    status: "on_street",
    render_meta: null,
    equipped_vehicle: null,
  } as unknown as StreetUser;
}

const BASE = "http://localhost:8000";

beforeEach(() => {
  usePresenceStore.setState({ byId: {}, pendingRehydrate: false });
});

afterEach(() => {
  vi.clearAllMocks();
});

test("renders the empty-state copy when the leaderboard API returns no rows", async () => {
  server.use(
    http.get(`${BASE}/api/v1/leaderboard/today`, () => HttpResponse.json([])),
  );

  render(<SkyWindow />);

  // The empty state always shows under the rank board — when the API
  // resolves to [], the board flips from "loading" to "empty".
  await waitFor(() => {
    const rank = screen.getByTestId("sky-window-rank");
    expect(rank).toHaveTextContent(/empty/i);
  });

  // CRITICAL: no synthesized rows should ever appear, no matter how
  // long we wait. The previous SAMPLE_ROWS fallback would have shown
  // "Kai / Bear / Aria" here.
  expect(screen.queryByText(/Kai|Bear|Aria|Panda/)).toBeNull();
});

test("live online count comes from the presence store, not a static fixture", () => {
  usePresenceStore.setState({
    byId: {
      a: makeStreetUser("a"),
      b: makeStreetUser("b"),
      c: makeStreetUser("c"),
    },
    pendingRehydrate: false,
  });

  render(<SkyWindow />);

  // i18n stub serializes vars as JSON — assert `count` matches the
  // number of presence rows, NOT the previous hardcoded 2847.
  const online = screen.getByTestId("sky-window-online");
  expect(online).toHaveTextContent('"count":3');
  expect(online).not.toHaveTextContent("2847");
});

test("rank rows render in order with real display names + counts", async () => {
  server.use(
    http.get(`${BASE}/api/v1/leaderboard/today`, () =>
      HttpResponse.json([
        { user_id: "u-a", display_name: "Alice", character_key: null, completed_count: 12 },
        { user_id: "u-b", display_name: "Bob", character_key: null, completed_count: 7 },
      ]),
    ),
  );

  render(<SkyWindow />);

  await waitFor(() => {
    expect(screen.getByTestId("sky-window-rank-row-1")).toHaveTextContent("Alice");
  });

  const row1 = screen.getByTestId("sky-window-rank-row-1");
  expect(row1).toHaveTextContent("12");
  // Today's minutes is completed_count * 25 — a regression here would
  // mean we're showing fabricated values again.
  expect(row1).toHaveTextContent("300min");

  expect(screen.getByTestId("sky-window-rank-row-2")).toHaveTextContent("Bob");
});

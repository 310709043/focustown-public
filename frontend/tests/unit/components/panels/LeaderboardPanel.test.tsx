/**
 * LeaderboardPanel component tests.
 *
 * Worth testing:
 * - Empty response → renders the "尚無資料" empty state.
 * - Populated response → renders rows, top three carry medal emojis.
 * - Self-row recognisable: tomato count displays correctly.
 *
 * Not tested:
 * - The 30s polling interval — that's framework wiring; the meaningful
 *   contract is "the latest API response is rendered", which we cover.
 * - Specific character emojis from CHARACTERS data.
 */
import { afterEach, expect, test } from "vitest";
import { http, HttpResponse } from "msw";
import { render, screen } from "@testing-library/react";

import { LeaderboardPanel } from "@/components/panels/LeaderboardPanel";
import { server } from "../../../setup";

const BASE = "http://localhost:8000";

afterEach(() => {
  server.resetHandlers();
});

test("renders empty state when API returns no rows", async () => {
  // Default handler already returns []; assert the rendered copy.
  render(<LeaderboardPanel />);
  expect(await screen.findByText("尚無資料")).toBeInTheDocument();
});

test("renders rows with medal for top three", async () => {
  server.use(
    http.get(`${BASE}/api/v1/leaderboard/today`, () =>
      HttpResponse.json([
        { user_id: "u-1", display_name: "Alice", character_key: null, completed_count: 9 },
        { user_id: "u-2", display_name: "Bob", character_key: null, completed_count: 7 },
        { user_id: "u-3", display_name: "Carol", character_key: null, completed_count: 5 },
      ]),
    ),
  );

  render(<LeaderboardPanel />);

  expect(await screen.findByText("Alice")).toBeInTheDocument();
  expect(screen.getByText("Bob")).toBeInTheDocument();
  expect(screen.getByText("Carol")).toBeInTheDocument();
  // Top three medals — at least one is the gold medal.
  expect(screen.getByText("🥇")).toBeInTheDocument();
});

test("renders the tomato count for each entry", async () => {
  server.use(
    http.get(`${BASE}/api/v1/leaderboard/today`, () =>
      HttpResponse.json([
        {
          user_id: "u-1",
          display_name: "Alice",
          character_key: null,
          completed_count: 9,
        },
      ]),
    ),
  );

  render(<LeaderboardPanel />);

  expect(await screen.findByText(/🍅\s*9/)).toBeInTheDocument();
});

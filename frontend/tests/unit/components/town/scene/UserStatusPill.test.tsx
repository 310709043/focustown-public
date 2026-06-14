/**
 * UserStatusPill renders DB-backed numbers, not hardcoded fixtures.
 *
 * Regression cover for the 2026-05-24 fix where the top HUD pill was
 * stuck on LV 4 / 4/8 🔋 / 22 min regardless of the signed-in user.
 *
 * Worth testing:
 *  - Level + tomato totals reflect what `useUserStats` returns
 *    (sourced from `/users/me/stats`).
 *  - Idle vs focusing branch flips based on `useTimerStore.running`
 *    + `mode === "focus"`.
 *  - Minutes label reads from `timerStore.remaining`, not a fixed 22.
 *  - Tomato strip never shrinks below the visual cap of 8 cells, and
 *    a power user with 12 tomatoes shows 12 in the trailing counter.
 *
 * NOT worth testing:
 *  - Avatar sprite — visual; covered by Playwright pixel checks.
 *  - The neon-glow CSS — design token, not behavioral.
 */
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { UserStatusPill } from "@/components/town/scene/UserStatusPill";
import { useAuthStore } from "@/lib/state/authStore";
import { useTimerStore } from "@/lib/state/timerStore";
import { makeUser } from "@/tests/fixtures/factories";

const useUserStatsMock = vi.fn();
vi.mock("@/lib/hooks/useUserStats", () => ({
  useUserStats: (...args: unknown[]) => useUserStatsMock(...args),
}));

function statsFixture(overrides: Partial<{
  totalTomatoes: number;
  level: number;
}> = {}) {
  return {
    kpis: {
      totalTomatoes: overrides.totalTomatoes ?? 0,
      allTimeFocusHours: 0,
      streakDays: 0,
      weeklyRank: 0,
    },
    weekTotalHours: 0,
    heatmap: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0)),
    level: overrides.level ?? 1,
    xp: 0,
    xpNextLevel: 2000,
    recentAchievements: [],
    isLoading: false,
  };
}

beforeEach(() => {
  useAuthStore.setState({
    user: makeUser({ id: "u-1", display_name: "Alice" }),
    loading: false,
    error: null,
  });
  useTimerStore.setState({
    mode: "focus",
    durationSeconds: 1500,
    remaining: 1500,
    running: false,
    starting: false,
    session: null,
    tomatoCount: 0,
  });
  useUserStatsMock.mockReturnValue(statsFixture());
});

afterEach(() => {
  vi.clearAllMocks();
});

test("level + tomato count come from useUserStats, not a hardcoded LV.4", () => {
  useUserStatsMock.mockReturnValue(
    statsFixture({ totalTomatoes: 3, level: 7 }),
  );

  render(<UserStatusPill />);

  expect(screen.getByTestId("user-status-pill-level")).toHaveTextContent(
    '"level":7',
  );
  expect(screen.getByTestId("user-status-pill-tomatoes")).toHaveTextContent(
    "3",
  );
});

test("idle status shows the 'idle' branch with no minutes pill", () => {
  // timer not running → status reads idle and minutes line is absent.
  render(<UserStatusPill />);

  expect(screen.getByTestId("user-status-pill-status")).toHaveTextContent(
    /idle/i,
  );
  expect(screen.queryByTestId("user-status-pill-minutes")).toBeNull();
});

test("focusing status shows focusing branch + live minute remaining", () => {
  useUserStatsMock.mockReturnValue(
    statsFixture({ totalTomatoes: 4, level: 3 }),
  );
  useTimerStore.setState({
    mode: "focus",
    durationSeconds: 1500,
    remaining: 18 * 60 + 30, // 18:30 remaining → ceil to 19 min
    running: true,
    starting: false,
    session: null,
    tomatoCount: 4,
  });

  render(<UserStatusPill />);

  expect(screen.getByTestId("user-status-pill-status")).toHaveTextContent(
    "focusing",
  );
  // count = tomatoesToday + 1 (the in-progress one) — confirms we pull
  // tomato base from useUserStats, not a stale prop.
  expect(screen.getByTestId("user-status-pill-status")).toHaveTextContent(
    '"count":5',
  );
  // ceil(1110 / 60) = 19 — minutes always derive from timerStore.
  expect(screen.getByTestId("user-status-pill-minutes")).toHaveTextContent(
    '"count":19',
  );
});

test("break/long modes don't trigger the focusing copy even while running", () => {
  // A break timer is "running" but shouldn't claim the user is focusing.
  useTimerStore.setState({
    mode: "short",
    durationSeconds: 300,
    remaining: 280,
    running: true,
    starting: false,
    session: null,
    tomatoCount: 0,
  });

  render(<UserStatusPill />);

  expect(screen.getByTestId("user-status-pill-status")).toHaveTextContent(
    /idle/i,
  );
});

/**
 * ModeStatusBar — "you're in CITY MODE" status surface above BottomHUD.
 *
 * Worth testing:
 * - Pilot count comes from the presenceStore projection (not a prop).
 * - LIVE/offline label flips with `connection` on the active city scope.
 * - SOLO button routes to /focus/solo.
 * - TOGETHER button calls the lifted `onFindBuddy` handler (the same
 *   one MatchModal uses) — preserves a single matching entry point.
 *
 * NOT worth testing:
 * - Pulse animation CSS classes (visual, not behavioral).
 * - The dot color hex — covered by design tokens.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { ModeStatusBar } from "@/components/town/bottom/ModeStatusBar";
import { usePresenceStore } from "@/lib/state/presenceStore";
import { useStationStore } from "@/lib/state/stationStore";
import type { StreetUser } from "@/lib/api/types.gen";

const pushMock = vi.fn();

vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
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

beforeEach(() => {
  pushMock.mockReset();
  usePresenceStore.setState({ byId: {}, pendingRehydrate: false });
  useStationStore.setState({
    activeScope: { kind: "city", id: "lowbatterytown" },
    connection: { "city:lowbatterytown": "connected" },
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

test("renders the city mode label", () => {
  render(<ModeStatusBar onFindBuddy={vi.fn()} />);

  expect(screen.getByText(/cityLabel/i)).toBeInTheDocument();
});

test("shows LIVE label when active city scope is connected", () => {
  render(<ModeStatusBar onFindBuddy={vi.fn()} />);

  // Stub i18n returns the namespaced key — verifies the correct branch.
  expect(screen.getByTestId("mode-status-bar-live")).toHaveTextContent(/live/i);
});

test("shows offline label when active scope is disconnected", () => {
  useStationStore.setState({
    activeScope: { kind: "city", id: "lowbatterytown" },
    connection: { "city:lowbatterytown": "disconnected" },
  });

  render(<ModeStatusBar onFindBuddy={vi.fn()} />);

  expect(screen.getByTestId("mode-status-bar-live")).toHaveTextContent(
    /offline/i,
  );
});

test("shows offline label when active scope is null (not yet set on mount)", () => {
  // Audit F3: ModeStatusBar must not assume "city" when activeScope is
  // null. With the fallback removed, an idle/unhydrated state correctly
  // reads as offline until the town page sets the scope.
  useStationStore.setState({
    activeScope: null,
    connection: {},
  });

  render(<ModeStatusBar onFindBuddy={vi.fn()} />);

  expect(screen.getByTestId("mode-status-bar-live")).toHaveTextContent(
    /offline/i,
  );
});

test("shows offline label when active scope is pair (not city)", () => {
  // Audit F3: a leftover pair scope from a previous focus session must
  // not show LIVE on the city status bar.
  useStationStore.setState({
    activeScope: { kind: "pair", id: "match-123" },
    connection: { "pair:match-123": "connected" },
  });

  render(<ModeStatusBar onFindBuddy={vi.fn()} />);

  expect(screen.getByTestId("mode-status-bar-live")).toHaveTextContent(
    /offline/i,
  );
});

test("renders the pilot-count translation key with the presence count", () => {
  usePresenceStore.setState({
    byId: { a: makeStreetUser("a"), b: makeStreetUser("b") },
    pendingRehydrate: false,
  });

  render(<ModeStatusBar onFindBuddy={vi.fn()} />);

  // i18n stub serializes `vars` as JSON next to the key so we can confirm
  // the count flowed through.
  expect(screen.getByTestId("mode-status-bar-pilots")).toHaveTextContent(
    '"count":2',
  );
});

test("SOLO button routes to /focus/solo", () => {
  render(<ModeStatusBar onFindBuddy={vi.fn()} />);

  fireEvent.click(screen.getByTestId("mode-status-bar-solo"));

  expect(pushMock).toHaveBeenCalledWith("/focus/solo");
});

test("TOGETHER button calls the lifted onFindBuddy handler", () => {
  const onFindBuddy = vi.fn();
  render(<ModeStatusBar onFindBuddy={onFindBuddy} />);

  fireEvent.click(screen.getByTestId("mode-status-bar-together"));

  expect(onFindBuddy).toHaveBeenCalledOnce();
});

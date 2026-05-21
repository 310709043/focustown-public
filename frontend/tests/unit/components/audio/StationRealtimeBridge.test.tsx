/**
 * StationRealtimeBridge — singleton-mounted in the locale layout that
 * routes station.cursor WS events into stationStore + ticks subscribers
 * once per second so getCurrentTrackId(now) crosses track boundaries
 * smoothly between cursor advances.
 *
 * Worth testing:
 * - station.cursor of kind=city updates stationStore.city
 * - station.cursor of kind=pair updates stationStore.pair[scope_id]
 * - non-station messages are ignored
 * - cursor messages with unknown ``kind`` are dropped (invariant against
 *   spec drift between WS payload and frontend literal union)
 */
import { render } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

let _handler: ((msg: unknown) => void) | null = null;

vi.mock("@/lib/ws/useRealtime", () => ({
  useRealtime: (handler: (msg: unknown) => void) => {
    _handler = handler;
    return null;
  },
}));

import { StationRealtimeBridge } from "@/components/audio/StationRealtimeBridge";
import { useStationStore } from "@/lib/state/stationStore";

beforeEach(() => {
  _handler = null;
  useStationStore.setState({
    city: null,
    pair: {},
    tracksById: {},
    activeScope: null,
    connection: {},
    mutedWhileDisconnected: false,
    personalPlaylist: [],
    personalIndex: 0,
  });
});

test("city station.cursor routes into stationStore.city", () => {
  render(<StationRealtimeBridge />);
  _handler!({
    type: "station.cursor",
    kind: "city",
    scope_id: "lowbatterytown",
    playlist_ids: ["t-1", "t-2"],
    cursor_index: 0,
    started_at_ms: 1_000_000,
    version: 1,
  });

  expect(useStationStore.getState().city?.playlistIds).toEqual(["t-1", "t-2"]);
  expect(useStationStore.getState().city?.cursorIndex).toBe(0);
});

test("pair station.cursor routes into stationStore.pair keyed by match id", () => {
  render(<StationRealtimeBridge />);
  _handler!({
    type: "station.cursor",
    kind: "pair",
    scope_id: "match-7",
    playlist_ids: ["p-1", "p-2"],
    cursor_index: 1,
    started_at_ms: 2_000_000,
    version: 3,
  });

  expect(useStationStore.getState().pair["match-7"]?.cursorIndex).toBe(1);
});

test("non-station.cursor messages are ignored (no store mutation)", () => {
  render(<StationRealtimeBridge />);
  _handler!({ type: "chat", room_id: "r-1", text: "hi" });
  _handler!({ type: "music.play", room_id: "r-1", track_id: "t-1", started_at_ms: 1 });

  expect(useStationStore.getState().city).toBeNull();
  expect(useStationStore.getState().pair).toEqual({});
});

test("cursor with unknown kind is dropped (spec-drift guard)", () => {
  render(<StationRealtimeBridge />);
  _handler!({
    type: "station.cursor",
    kind: "region", // not a recognised kind
    scope_id: "x",
    playlist_ids: [],
    cursor_index: 0,
    started_at_ms: 0,
    version: 0,
  });

  expect(useStationStore.getState().city).toBeNull();
  expect(useStationStore.getState().pair).toEqual({});
});

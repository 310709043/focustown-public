/**
 * stationStore — cohort cursor projection + connection state.
 *
 * Worth testing (each rule encodes a real behavior the audio mount
 * depends on):
 *   - applyCursor lands a city cursor and a per-match pair cursor
 *   - getCurrentTrackId walks playlist + durations to find the bucket
 *     containing ``now``
 *   - getCurrentTrackId returns the cursor's track at ``startedAtMs``
 *     exactly (boundary)
 *   - disconnect / reconnect toggle preserves the cursor (the WS
 *     events keep arriving while disconnected; cursor must stay live)
 *   - setActiveScope seeds first-time connection to "connected" but
 *     does NOT overwrite a previous user choice
 *
 * NOT worth testing:
 *   - selectActiveConnection — trivial Record lookup with default
 *   - hydrateCity / hydratePair network paths — covered by the WS
 *     routing test + E2E
 */
import { beforeEach, expect, test } from "vitest";

import {
  scopeKey,
  useStationStore,
  type StationCursorPayload,
} from "@/lib/state/stationStore";

const CITY_PAYLOAD: StationCursorPayload = {
  type: "station.cursor",
  kind: "city",
  scope_id: "lowbatterytown",
  playlist_ids: ["t-1", "t-2", "t-3"],
  cursor_index: 0,
  started_at_ms: 1_000_000,
  version: 1,
};

const PAIR_PAYLOAD: StationCursorPayload = {
  type: "station.cursor",
  kind: "pair",
  scope_id: "match-7",
  playlist_ids: ["p-1", "p-2"],
  cursor_index: 0,
  started_at_ms: 2_000_000,
  version: 1,
};

beforeEach(() => {
  useStationStore.setState({
    city: null,
    pair: {},
    tracksById: {
      "t-1": { id: "t-1", title: "T1", artist: null, mood: "lofi", durationMs: 180_000, contentType: "audio/mpeg" },
      "t-2": { id: "t-2", title: "T2", artist: null, mood: "lofi", durationMs: 180_000, contentType: "audio/mpeg" },
      "t-3": { id: "t-3", title: "T3", artist: null, mood: "lofi", durationMs: 180_000, contentType: "audio/mpeg" },
      "p-1": { id: "p-1", title: "P1", artist: null, mood: "lofi", durationMs: 120_000, contentType: "audio/mpeg" },
      "p-2": { id: "p-2", title: "P2", artist: null, mood: "lofi", durationMs: 120_000, contentType: "audio/mpeg" },
    },
    activeScope: null,
    connection: {},
    mutedWhileDisconnected: false,
    personalPlaylist: [],
    personalIndex: 0,
  });
});

test("applyCursor stores city cursor under .city", () => {
  useStationStore.getState().applyCursor(CITY_PAYLOAD);
  expect(useStationStore.getState().city?.playlistIds).toEqual(["t-1", "t-2", "t-3"]);
});

test("applyCursor stores pair cursors keyed by match id", () => {
  useStationStore.getState().applyCursor(PAIR_PAYLOAD);
  expect(useStationStore.getState().pair["match-7"]?.cursorIndex).toBe(0);
});

test("getCurrentTrackId at startedAtMs returns the cursor's track", () => {
  useStationStore.getState().applyCursor(CITY_PAYLOAD);
  useStationStore.getState().setActiveScope({ kind: "city", id: "lowbatterytown" });
  expect(useStationStore.getState().getCurrentTrackId(CITY_PAYLOAD.started_at_ms)).toBe("t-1");
});

test("getCurrentTrackId walks playlist + durations to find the bucket containing now", () => {
  useStationStore.getState().applyCursor(CITY_PAYLOAD);
  useStationStore.getState().setActiveScope({ kind: "city", id: "lowbatterytown" });
  // 200s past start: first track (180s) is done; we're 20s into the second.
  const future = CITY_PAYLOAD.started_at_ms + 200_000;
  expect(useStationStore.getState().getCurrentTrackId(future)).toBe("t-2");
});

test("getCurrentTrackId one ms before track-end still returns the current track (boundary)", () => {
  useStationStore.getState().applyCursor(CITY_PAYLOAD);
  useStationStore.getState().setActiveScope({ kind: "city", id: "lowbatterytown" });
  const justBefore = CITY_PAYLOAD.started_at_ms + 180_000 - 1;
  expect(useStationStore.getState().getCurrentTrackId(justBefore)).toBe("t-1");
});

test("disconnect then reconnect preserves the city cursor", () => {
  useStationStore.getState().applyCursor(CITY_PAYLOAD);
  useStationStore.getState().setActiveScope({ kind: "city", id: "lowbatterytown" });
  useStationStore.getState().disconnect();
  useStationStore.getState().reconnect();
  expect(useStationStore.getState().city?.playlistIds).toEqual(["t-1", "t-2", "t-3"]);
  expect(useStationStore.getState().city?.startedAtMs).toBe(CITY_PAYLOAD.started_at_ms);
});

test("setActiveScope seeds first-time visit to connected", () => {
  useStationStore.getState().setActiveScope({ kind: "city", id: "lowbatterytown" });
  const key = scopeKey({ kind: "city", id: "lowbatterytown" });
  expect(useStationStore.getState().connection[key]).toBe("connected");
});

test("setActiveScope does not overwrite a prior user choice on re-entry", () => {
  useStationStore.getState().setActiveScope({ kind: "city", id: "lowbatterytown" });
  useStationStore.getState().disconnect();
  // Re-enter the same scope — disconnected choice must survive.
  useStationStore.getState().setActiveScope({ kind: "city", id: "lowbatterytown" });
  const key = scopeKey({ kind: "city", id: "lowbatterytown" });
  expect(useStationStore.getState().connection[key]).toBe("disconnected");
});

test("reconnect always clears the muted-while-disconnected flag", () => {
  useStationStore.getState().applyCursor(CITY_PAYLOAD);
  useStationStore.getState().setActiveScope({ kind: "city", id: "lowbatterytown" });
  useStationStore.getState().disconnect();
  useStationStore.getState().setMuted(true);
  useStationStore.getState().reconnect();
  expect(useStationStore.getState().mutedWhileDisconnected).toBe(false);
});

test("nextPersonal advances the cursor modulo playlist length", () => {
  useStationStore.setState({
    personalPlaylist: [
      { id: "x-1", title: "X1", artist: null, mood: "lofi", duration_ms: 180_000, content_type: "audio/mpeg" },
      { id: "x-2", title: "X2", artist: null, mood: "lofi", duration_ms: 180_000, content_type: "audio/mpeg" },
    ],
    personalIndex: 1,
  });
  useStationStore.getState().nextPersonal();
  expect(useStationStore.getState().personalIndex).toBe(0);
});

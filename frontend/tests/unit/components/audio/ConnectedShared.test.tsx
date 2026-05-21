/**
 * ConnectedShared — "we're listening together" cohort-station view.
 *
 * Worth testing (encodes the UX promise the user signed off on):
 * - Renders the right header label per scope (city vs pair)
 * - Renders the active station track title when one is in the store
 * - Renders the "tuning in" placeholder when no track is in the store
 * - Click "Disconnect" calls stationStore.disconnect()
 * - Renders the unlock CTA when audio is still locked; click → unlock store
 *
 * Single Disconnect button is the only mutation control by design — the
 * panel intentionally has no prev/next/volume/mute (that's exclusive to
 * the disconnected variant).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { ConnectedShared } from "@/components/audio/ConnectedShared";
import { useAudioStore } from "@/lib/state/audioStore";
import { useStationStore } from "@/lib/state/stationStore";

beforeEach(() => {
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
  useAudioStore.setState({
    audioUnlocked: false,
    isPlaying: false,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("renders the city header label when scopeKind=city", () => {
  render(<ConnectedShared scopeKind="city" />);

  // i18n stub returns the namespaced key — verifies the right key is asked for.
  expect(screen.getByText(/cityHeader/i)).toBeInTheDocument();
});

test("renders the pair header label when scopeKind=pair", () => {
  render(<ConnectedShared scopeKind="pair" />);

  expect(screen.getByText(/pairHeader/i)).toBeInTheDocument();
});

test("renders the loading placeholder when no track is currently selected", () => {
  render(<ConnectedShared scopeKind="city" />);

  expect(screen.getByText(/loadingTrack/i)).toBeInTheDocument();
});

test("renders the active track title once the station + active scope are populated", () => {
  useStationStore.setState({
    activeScope: { kind: "city", id: "lowbatterytown" },
    city: {
      kind: "city",
      scopeId: "lowbatterytown",
      playlistIds: ["t-1"],
      cursorIndex: 0,
      startedAtMs: Date.now(),
      version: 1,
    },
    tracksById: {
      "t-1": {
        id: "t-1",
        title: "Cold Ceramics",
        artist: "Local Artist",
        mood: "lofi",
        durationMs: 180_000,
        contentType: "audio/mpeg",
      },
    },
  });

  render(<ConnectedShared scopeKind="city" />);

  expect(screen.getByText("Cold Ceramics")).toBeInTheDocument();
  expect(screen.getByText("Local Artist")).toBeInTheDocument();
});

test("Disconnect button invokes stationStore.disconnect()", () => {
  useStationStore.setState({
    activeScope: { kind: "city", id: "lowbatterytown" },
    city: {
      kind: "city",
      scopeId: "lowbatterytown",
      playlistIds: ["t-1"],
      cursorIndex: 0,
      startedAtMs: Date.now(),
      version: 1,
    },
    connection: { "city:lowbatterytown": "connected" },
  });
  render(<ConnectedShared scopeKind="city" />);

  fireEvent.click(screen.getByTestId("station-disconnect"));

  expect(useStationStore.getState().connection["city:lowbatterytown"]).toBe(
    "disconnected",
  );
});

test("listener count badge shows the supplied prop when provided", () => {
  render(<ConnectedShared scopeKind="city" listenerCount={3} />);

  // i18n stub returns "town.bottom.stationPlayer.listeners({"count":3})"
  expect(screen.getByText(/listeners.*"count":3/i)).toBeInTheDocument();
});

test("listener count badge falls back to listenersUnknown when prop is absent", () => {
  render(<ConnectedShared scopeKind="city" />);

  expect(screen.getByText(/listenersUnknown/i)).toBeInTheDocument();
});

test("unlock CTA renders while audioUnlocked=false", () => {
  render(<ConnectedShared scopeKind="city" />);

  expect(screen.getByTestId("station-unlock")).toBeInTheDocument();
});

test("unlock CTA disappears once audio is unlocked", () => {
  useAudioStore.setState({ audioUnlocked: true });

  render(<ConnectedShared scopeKind="city" />);

  expect(screen.queryByTestId("station-unlock")).toBeNull();
});

test("unlock CTA click toggles audioUnlocked=true", () => {
  render(<ConnectedShared scopeKind="city" />);

  fireEvent.click(screen.getByTestId("station-unlock"));

  expect(useAudioStore.getState().audioUnlocked).toBe(true);
});

/**
 * DisconnectedPersonal — "you stepped out" personal-mix view.
 *
 * Worth testing (the controls are the UX promise — they exist ONLY in
 * this state, not in ConnectedShared):
 * - Renders the disconnected label + reconnect CTA (per scope kind)
 * - Personal playlist track + position render correctly
 * - prev / next dispatch stationStore.prevPersonal / nextPersonal
 * - reconnect button calls stationStore.reconnect()
 * - transport disabled when playlist is empty (no orphan state)
 *
 * 2026-05-22: standalone mute button removed (volume==0 is the
 * user-visible mute) so the panel fits inside the 168 px BottomHUD
 * band. The underlying ``mutedWhileDisconnected`` store flag is
 * untouched — still consumed by GlobalAudioMount for backward compat.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test } from "vitest";

import { DisconnectedPersonal } from "@/components/audio/DisconnectedPersonal";
import { useAudioStore } from "@/lib/state/audioStore";
import { useStationStore } from "@/lib/state/stationStore";

const trackA = {
  id: "x-1",
  title: "Personal A",
  artist: "Solo Artist",
  mood: "lofi",
  duration_ms: 180_000,
  content_type: "audio/mpeg",
};
const trackB = { ...trackA, id: "x-2", title: "Personal B" };

beforeEach(() => {
  useStationStore.setState({
    city: null,
    pair: {},
    tracksById: {},
    activeScope: { kind: "city", id: "lowbatterytown" },
    connection: { "city:lowbatterytown": "disconnected" },
    mutedWhileDisconnected: false,
    personalPlaylist: [trackA, trackB],
    personalIndex: 0,
  });
  useAudioStore.setState({
    isPlaying: false,
    volume: 0.65,
    audioUnlocked: true,
  });
});

test("renders the city reconnect label when scopeKind=city", () => {
  render(<DisconnectedPersonal scopeKind="city" />);

  expect(screen.getByTestId("station-reconnect")).toHaveTextContent(/reconnectCity/i);
});

test("renders the pair reconnect label when scopeKind=pair", () => {
  render(<DisconnectedPersonal scopeKind="pair" />);

  expect(screen.getByTestId("station-reconnect")).toHaveTextContent(/reconnectPair/i);
});

test("renders the current personal track title + position", () => {
  render(<DisconnectedPersonal scopeKind="city" />);

  expect(screen.getByText("Personal A")).toBeInTheDocument();
  expect(screen.getByText(/1\/2.*Solo Artist/)).toBeInTheDocument();
});

test("next button advances personalIndex via store", () => {
  render(<DisconnectedPersonal scopeKind="city" />);

  fireEvent.click(screen.getByTestId("station-next"));

  expect(useStationStore.getState().personalIndex).toBe(1);
});

test("prev button rewinds personalIndex via store (with wrap)", () => {
  render(<DisconnectedPersonal scopeKind="city" />);

  fireEvent.click(screen.getByTestId("station-prev"));

  // index 0 - 1 wraps to 1 (length=2).
  expect(useStationStore.getState().personalIndex).toBe(1);
});

test("reconnect button flips connection state back to connected", () => {
  render(<DisconnectedPersonal scopeKind="city" />);

  fireEvent.click(screen.getByTestId("station-reconnect"));

  expect(useStationStore.getState().connection["city:lowbatterytown"]).toBe(
    "connected",
  );
});

test("transport buttons are disabled when the personal playlist is empty", () => {
  useStationStore.setState({ personalPlaylist: [], personalIndex: 0 });

  render(<DisconnectedPersonal scopeKind="city" />);

  expect(screen.getByTestId("station-prev")).toBeDisabled();
  expect(screen.getByTestId("station-next")).toBeDisabled();
  expect(screen.getByTestId("station-toggle-play")).toBeDisabled();
});

test("renders the playlist-empty fallback title when there's no track", () => {
  useStationStore.setState({ personalPlaylist: [], personalIndex: 0 });

  render(<DisconnectedPersonal scopeKind="city" />);

  expect(screen.getByText(/playlistEmpty/i)).toBeInTheDocument();
});

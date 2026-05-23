/**
 * UnmuteHint — floating "Tap to unmute" chip shown while muted autoplay
 * is in effect on /town's city scope.
 *
 * Behavioral contract (what we encode here):
 *   - Renders null outside the city station scope (solo/library/pair).
 *   - Renders the chip when scope=city AND audio is still locked.
 *   - Renders null once audio is unlocked (irrespective of scope).
 *   - Clicking the chip flips audioStore.audioUnlocked to true.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { UnmuteHint } from "@/components/audio/UnmuteHint";
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

test("renders null when no active scope is set", () => {
  render(<UnmuteHint />);

  expect(screen.queryByTestId("audio-unmute-hint")).toBeNull();
});

test("renders null on a pair scope (only city autoplays this CTA)", () => {
  useStationStore.setState({
    activeScope: { kind: "pair", id: "match-1" },
  });

  render(<UnmuteHint />);

  expect(screen.queryByTestId("audio-unmute-hint")).toBeNull();
});

test("renders the chip when scope=city AND audio is locked", () => {
  useStationStore.setState({
    activeScope: { kind: "city", id: "lowbatterytown" },
  });

  render(<UnmuteHint />);

  expect(screen.getByTestId("audio-unmute-hint")).toBeInTheDocument();
});

test("renders null once audio is unlocked even if scope is city", () => {
  useStationStore.setState({
    activeScope: { kind: "city", id: "lowbatterytown" },
  });
  useAudioStore.setState({ audioUnlocked: true });

  render(<UnmuteHint />);

  expect(screen.queryByTestId("audio-unmute-hint")).toBeNull();
});

test("clicking the chip flips audioUnlocked to true", () => {
  useStationStore.setState({
    activeScope: { kind: "city", id: "lowbatterytown" },
  });

  render(<UnmuteHint />);
  fireEvent.click(screen.getByTestId("audio-unmute-hint"));

  expect(useAudioStore.getState().audioUnlocked).toBe(true);
});

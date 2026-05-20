/**
 * GlobalAudioMount — the singleton <audio> mount.
 *
 * Worth testing (each rule encodes a real symptom shipped after PR #91 went
 * live on AWS dev: "no music plays"):
 *   - The mounted <audio> has NO crossOrigin attribute. Plain <audio> plays
 *     cross-origin without CORS; crossOrigin="anonymous" would re-trigger
 *     the very CORS preflight that prod S3 is currently missing.
 *   - When in station mode and every track in the visible playlist errors
 *     within one burst window, the store flips to LOCAL_FALLBACK_TRACKS and
 *     drops activeScope so the source selector promotes audio-store.
 *   - A single error in station mode does NOT trigger the fallback (we
 *     still rely on the next station.cursor event for the common case).
 *
 * NOT worth testing here:
 *   - audio-store burst fallback (already covered by PR #90 behavior)
 *   - personal-mode advance-on-error (one bad track shouldn't poison the
 *     playhead — trivial logic, not the regression we're fixing)
 *   - Crossfade timing (cosmetic — covered by manual review)
 */
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { render } from "@testing-library/react";

import { GlobalAudioMount } from "@/components/audio/GlobalAudioMount";
import {
  LOCAL_FALLBACK_TRACKS,
  useAudioStore,
} from "@/lib/state/audioStore";
import {
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

beforeEach(() => {
  useStationStore.setState({
    city: null,
    pair: {},
    tracksById: {
      "t-1": { id: "t-1", title: "T1", artist: null, mood: "lofi", durationMs: 180_000, contentType: "audio/mpeg" },
      "t-2": { id: "t-2", title: "T2", artist: null, mood: "lofi", durationMs: 180_000, contentType: "audio/mpeg" },
      "t-3": { id: "t-3", title: "T3", artist: null, mood: "lofi", durationMs: 180_000, contentType: "audio/mpeg" },
    },
    activeScope: null,
    connection: {},
    mutedWhileDisconnected: false,
    personalPlaylist: [],
    personalIndex: 0,
  });
  useAudioStore.setState({
    context: null,
    contextId: null,
    tracks: [],
    index: 0,
    isPlaying: false,
    volume: 0.7,
    audioUnlocked: false,
    hidden: false,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("mounted audio element has no crossOrigin attribute (CORS-free playback)", () => {
  const { container } = render(<GlobalAudioMount />);
  const audio = container.querySelector("audio");
  // getAttribute returns null when the attribute is absent — that's the
  // contract we want. crossOrigin="anonymous" was the root cause of the
  // CORS-blocked S3 redirect symptom observed in AWS dev DevTools.
  expect(audio?.getAttribute("crossorigin")).toBeNull();
});

test("station-mode error on first track does NOT switch to local fallback", () => {
  useStationStore.getState().applyCursor(CITY_PAYLOAD);
  useStationStore.getState().setActiveScope({
    kind: "city",
    id: "lowbatterytown",
  });
  const { container } = render(<GlobalAudioMount />);
  const audio = container.querySelector("audio")!;

  audio.dispatchEvent(new Event("error"));

  // Still in station mode; the next station.cursor will repoint normally.
  expect(useStationStore.getState().activeScope).not.toBeNull();
  expect(useAudioStore.getState().tracks).not.toEqual(LOCAL_FALLBACK_TRACKS);
});

test("station-mode burst-fail across whole playlist swaps to local fallback", () => {
  useStationStore.getState().applyCursor(CITY_PAYLOAD);
  useStationStore.getState().setActiveScope({
    kind: "city",
    id: "lowbatterytown",
  });
  const { container } = render(<GlobalAudioMount />);
  const audio = container.querySelector("audio")!;

  // Three tracks in the playlist; emit one error per track within the
  // 800ms burst window by advancing the station cursor between each.
  for (let i = 0; i < CITY_PAYLOAD.playlist_ids.length; i += 1) {
    useStationStore.setState({
      city: {
        ...useStationStore.getState().city!,
        cursorIndex: i,
      },
    });
    audio.dispatchEvent(new Event("error"));
  }

  // Fallback wins: activeScope cleared, audioStore swapped to LOCAL_FALLBACK.
  expect(useStationStore.getState().activeScope).toBeNull();
  expect(useAudioStore.getState().tracks).toEqual(LOCAL_FALLBACK_TRACKS);
  expect(useAudioStore.getState().isPlaying).toBe(true);
});

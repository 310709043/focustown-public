/**
 * audioStore — global audio playback state for personal radio.
 *
 * Worth testing:
 * - setContext fetches the personal playlist + seeds tracks/index
 * - setContext is idempotent for the same (context, context_id) — no refetch
 *   on navigating back to the same page
 * - setContext falls back to LOCAL_FALLBACK_TRACKS on API error if tracks empty
 * - play before unlock records intent; toggle while unlocked flips
 * - next/prev wrap around the playlist
 * - setVolume clamps to [0, 1]
 * - resolveTrackSrc returns the streamUrl for backend tracks, static path for local fallbacks
 * - selectCurrentTrack returns the indexed track or null
 */
import { beforeEach, expect, test, vi } from "vitest";

import type { PersonalPlaylistTrack } from "@/lib/api/endpoints";

const getPlaylist = vi.fn();

vi.mock("@/lib/api/endpoints", async () => {
  const actual: any = await vi.importActual("@/lib/api/endpoints");
  return {
    ...actual,
    personalRadioApi: {
      getPlaylist: (...a: unknown[]) => getPlaylist(...a),
    },
  };
});

vi.mock("@/lib/audio/unlock", () => ({
  clearAudioUnlocked: vi.fn(),
  isAudioUnlocked: () => false,
  markAudioUnlocked: vi.fn(),
}));

import {
  LOCAL_FALLBACK_TRACKS,
  resolveTrackSrc,
  selectCurrentTrack,
  useAudioStore,
} from "@/lib/state/audioStore";

const trackA: PersonalPlaylistTrack = {
  id: "t-a",
  title: "A",
  artist: null,
  mood: "lofi",
  duration_ms: 180_000,
  content_type: "audio/mpeg",
};
const trackB: PersonalPlaylistTrack = { ...trackA, id: "t-b", title: "B" };

beforeEach(() => {
  useAudioStore.setState({
    context: null,
    contextId: null,
    tracks: [],
    index: 0,
    isPlaying: false,
    volume: 0.65,
    audioUnlocked: false,
    hidden: false,
  });
  getPlaylist.mockReset();
});

test("setContext fetches the playlist and seeds index 0", async () => {
  getPlaylist.mockResolvedValue({ tracks: [trackA, trackB] });

  await useAudioStore.getState().setContext("city", "city");

  expect(useAudioStore.getState().tracks).toEqual([trackA, trackB]);
  expect(useAudioStore.getState().index).toBe(0);
  expect(useAudioStore.getState().context).toBe("city");
});

test("setContext is idempotent for the same (context, contextId)", async () => {
  getPlaylist.mockResolvedValue({ tracks: [trackA] });
  await useAudioStore.getState().setContext("city", "city");

  await useAudioStore.getState().setContext("city", "city");

  expect(getPlaylist).toHaveBeenCalledOnce();
});

test("setContext refetches when contextId changes", async () => {
  getPlaylist.mockResolvedValue({ tracks: [trackA] });
  await useAudioStore.getState().setContext("focus", "session-1");

  await useAudioStore.getState().setContext("focus", "session-2");

  expect(getPlaylist).toHaveBeenCalledTimes(2);
});

test("setContext falls back to LOCAL_FALLBACK_TRACKS on API error when no prior tracks", async () => {
  getPlaylist.mockRejectedValue(new Error("502"));

  await useAudioStore.getState().setContext("city", "city");

  expect(useAudioStore.getState().tracks).toEqual(LOCAL_FALLBACK_TRACKS);
});

test("setContext on API error preserves prior tracks (no clobber)", async () => {
  useAudioStore.setState({ tracks: [trackA, trackB], index: 1 });
  getPlaylist.mockRejectedValue(new Error("502"));

  await useAudioStore.getState().setContext("focus", "session-9");

  // Existing playlist still there; index unchanged.
  expect(useAudioStore.getState().tracks).toEqual([trackA, trackB]);
});

test("setContext with empty server playlist falls back to LOCAL_FALLBACK_TRACKS", async () => {
  getPlaylist.mockResolvedValue({ tracks: [] });

  await useAudioStore.getState().setContext("city", "city");

  expect(useAudioStore.getState().tracks).toEqual(LOCAL_FALLBACK_TRACKS);
});

test("setTracks replaces playlist and resets index", () => {
  useAudioStore.setState({ tracks: [trackA], index: 0 });

  useAudioStore.getState().setTracks([trackB]);

  expect(useAudioStore.getState().tracks).toEqual([trackB]);
  expect(useAudioStore.getState().index).toBe(0);
});

test("play before unlock records intent and marks audioUnlocked (gesture)", () => {
  useAudioStore.getState().play();

  // Both flags flip — play() is treated as a user gesture sufficient to
  // unlock the browser autoplay policy.
  expect(useAudioStore.getState().isPlaying).toBe(true);
  expect(useAudioStore.getState().audioUnlocked).toBe(true);
});

test("pause flips isPlaying false", () => {
  useAudioStore.setState({ isPlaying: true });

  useAudioStore.getState().pause();

  expect(useAudioStore.getState().isPlaying).toBe(false);
});

test("toggle flips isPlaying when already unlocked", () => {
  useAudioStore.setState({ isPlaying: true, audioUnlocked: true });

  useAudioStore.getState().toggle();

  expect(useAudioStore.getState().isPlaying).toBe(false);
});

test("toggle while locked unlocks + plays (treats click as gesture)", () => {
  useAudioStore.setState({ isPlaying: false, audioUnlocked: false });

  useAudioStore.getState().toggle();

  expect(useAudioStore.getState().audioUnlocked).toBe(true);
  expect(useAudioStore.getState().isPlaying).toBe(true);
});

test("next advances cursor and wraps at the end", () => {
  useAudioStore.setState({ tracks: [trackA, trackB], index: 1 });

  useAudioStore.getState().next();

  expect(useAudioStore.getState().index).toBe(0);
});

test("prev rewinds cursor and wraps at the start", () => {
  useAudioStore.setState({ tracks: [trackA, trackB], index: 0 });

  useAudioStore.getState().prev();

  expect(useAudioStore.getState().index).toBe(1);
});

test("next/prev on empty playlist are no-ops", () => {
  useAudioStore.setState({ tracks: [], index: 0 });

  useAudioStore.getState().next();
  useAudioStore.getState().prev();

  expect(useAudioStore.getState().index).toBe(0);
});

test("setVolume clamps below 0 and above 1", () => {
  useAudioStore.getState().setVolume(-0.5);
  expect(useAudioStore.getState().volume).toBe(0);

  useAudioStore.getState().setVolume(1.5);
  expect(useAudioStore.getState().volume).toBe(1);
});

test("setHidden toggles the hidden flag", () => {
  useAudioStore.getState().setHidden(true);
  expect(useAudioStore.getState().hidden).toBe(true);

  useAudioStore.getState().setHidden(false);
  expect(useAudioStore.getState().hidden).toBe(false);
});

test("unlock flips audioUnlocked + isPlaying together (single gesture)", () => {
  useAudioStore.getState().unlock();

  expect(useAudioStore.getState().audioUnlocked).toBe(true);
  expect(useAudioStore.getState().isPlaying).toBe(true);
});

test("setUnlocked(true) flips audioUnlocked", () => {
  useAudioStore.getState().setUnlocked(true);
  expect(useAudioStore.getState().audioUnlocked).toBe(true);
});

test("setUnlocked(false) clears audioUnlocked", () => {
  useAudioStore.setState({ audioUnlocked: true });
  useAudioStore.getState().setUnlocked(false);
  expect(useAudioStore.getState().audioUnlocked).toBe(false);
});

test("resolveTrackSrc returns empty string for null track", () => {
  expect(resolveTrackSrc(null)).toBe("");
});

test("resolveTrackSrc routes local:* track ids to /audio/*.mp3", () => {
  const src = resolveTrackSrc({
    id: "local:lofi-1",
    title: "x",
    artist: null,
    mood: "lofi",
    duration_ms: null,
    content_type: "audio/mpeg",
  });

  expect(src).toBe("/audio/lofi-1.mp3");
});

test("resolveTrackSrc routes backend track ids through the streamUrl helper", () => {
  const src = resolveTrackSrc(trackA);

  // Whatever the apiBaseUrl is, the path must end with /api/v1/tracks/{id}/stream.
  expect(src).toContain(`/api/v1/tracks/${trackA.id}/stream`);
});

test("selectCurrentTrack returns the indexed track", () => {
  useAudioStore.setState({ tracks: [trackA, trackB], index: 1 });

  expect(selectCurrentTrack(useAudioStore.getState())).toBe(trackB);
});

test("selectCurrentTrack returns null when out of bounds", () => {
  useAudioStore.setState({ tracks: [trackA], index: 5 });

  expect(selectCurrentTrack(useAudioStore.getState())).toBeNull();
});

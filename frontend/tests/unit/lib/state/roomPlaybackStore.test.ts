/**
 * roomPlaybackStore — visitor-side mirror of a room owner's playback.
 *
 * Worth testing:
 * - hydrate seeds from /rooms/{id}/playback snapshot
 * - hydrate empty snapshot leaves nullable fields null but still bumps version
 * - hydrate failure does NOT poison existing state (visitor stays silent, doesn't crash)
 * - applyPlay with a new track bumps trackVersion (player re-seeks)
 * - applyPlay with the same track does NOT bump trackVersion (no stutter)
 * - applyPause flips isPlaying off and stamps pausedAtMs
 * - applyChange always bumps trackVersion
 * - reset bumps trackVersion so the audio mount tears down its src
 */
import { beforeEach, expect, test, vi } from "vitest";

const getByRoom = vi.fn();

vi.mock("@/lib/api/endpoints", () => ({
  roomPlaybackApi: {
    getByRoom: (...args: unknown[]) => getByRoom(...args),
  },
}));

import { useRoomPlaybackStore } from "@/lib/state/roomPlaybackStore";

beforeEach(() => {
  useRoomPlaybackStore.setState({
    roomId: null,
    trackId: null,
    trackTitle: null,
    startedAtMs: null,
    pausedAtMs: null,
    isPlaying: false,
    trackVersion: 0,
  });
  getByRoom.mockReset();
});

test("hydrate seeds from snapshot and bumps trackVersion", async () => {
  getByRoom.mockResolvedValue({
    current_track_id: "t-1",
    track: { title: "Cozy Beat" },
    started_at_ms: 1_000,
    paused_at_ms: null,
    is_playing: true,
  });

  await useRoomPlaybackStore.getState().hydrate("room-1");

  const s = useRoomPlaybackStore.getState();
  expect(s.trackId).toBe("t-1");
  expect(s.trackTitle).toBe("Cozy Beat");
  expect(s.startedAtMs).toBe(1_000);
  expect(s.isPlaying).toBe(true);
  // bumped twice: once for the initial reset inside hydrate, once for the snapshot apply.
  expect(s.trackVersion).toBeGreaterThanOrEqual(2);
});

test("hydrate with no snapshot still resets and identifies the room", async () => {
  getByRoom.mockResolvedValue(null);

  await useRoomPlaybackStore.getState().hydrate("room-1");

  expect(useRoomPlaybackStore.getState().roomId).toBe("room-1");
  expect(useRoomPlaybackStore.getState().trackId).toBeNull();
});

test("hydrate swallows network errors so the visitor UI stays alive", async () => {
  getByRoom.mockRejectedValue(new Error("403"));

  // Must not throw.
  await useRoomPlaybackStore.getState().hydrate("room-1");

  // State stays consistent: roomId set, track stays null.
  expect(useRoomPlaybackStore.getState().roomId).toBe("room-1");
  expect(useRoomPlaybackStore.getState().trackId).toBeNull();
});

test("applyPlay with a different track bumps trackVersion (re-seek)", () => {
  useRoomPlaybackStore.setState({
    trackId: "t-1",
    trackVersion: 5,
  });

  useRoomPlaybackStore.getState().applyPlay({
    track_id: "t-2",
    started_at_ms: 2_000,
  });

  const s = useRoomPlaybackStore.getState();
  expect(s.trackId).toBe("t-2");
  expect(s.trackVersion).toBe(6);
  expect(s.isPlaying).toBe(true);
});

test("applyPlay with the SAME track does not bump trackVersion (no stutter on resume)", () => {
  useRoomPlaybackStore.setState({
    trackId: "t-1",
    trackVersion: 5,
  });

  useRoomPlaybackStore.getState().applyPlay({
    track_id: "t-1",
    started_at_ms: 9_999,
  });

  expect(useRoomPlaybackStore.getState().trackVersion).toBe(5);
});

test("applyPause flips isPlaying off and stamps pausedAtMs", () => {
  useRoomPlaybackStore.setState({
    trackId: "t-1",
    isPlaying: true,
  });

  useRoomPlaybackStore.getState().applyPause({ paused_at_ms: 7_777 });

  const s = useRoomPlaybackStore.getState();
  expect(s.isPlaying).toBe(false);
  expect(s.pausedAtMs).toBe(7_777);
});

test("applyChange always bumps trackVersion (owner explicit track switch)", () => {
  useRoomPlaybackStore.setState({
    trackId: "t-1",
    trackVersion: 5,
  });

  useRoomPlaybackStore.getState().applyChange({
    track_id: "t-2",
    started_at_ms: 3_000,
  });

  expect(useRoomPlaybackStore.getState().trackVersion).toBe(6);
});

test("reset blanks state and bumps trackVersion so the audio mount tears down", () => {
  useRoomPlaybackStore.setState({
    trackId: "t-1",
    isPlaying: true,
    trackVersion: 5,
  });

  useRoomPlaybackStore.getState().reset();

  const s = useRoomPlaybackStore.getState();
  expect(s.trackId).toBeNull();
  expect(s.isPlaying).toBe(false);
  expect(s.trackVersion).toBe(6);
});

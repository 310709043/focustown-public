"use client";

import { create } from "zustand";

import { roomPlaybackApi } from "@/lib/api/endpoints";

/**
 * Visitor-side mirror of a room owner's playback timeline.
 *
 * Backend `RoomPlaybackService` publishes `music.play|pause|change`
 * on the `room:{id}` channel; this store is the in-browser landing
 * pad. The accompanying `<SyncedRoomPlayer>` is the only piece that
 * touches `HTMLAudioElement` — store stays pure state.
 *
 * `trackVersion` bumps only when the underlying track identity
 * changes (initial hydrate, `applyChange`, or `applyPlay` with a
 * different track_id). Pure resumes (same track, was paused → now
 * playing) leave it alone so the player doesn't re-seek and stutter.
 */
interface RoomPlaybackState {
  roomId: string | null;
  trackId: string | null;
  trackTitle: string | null;
  startedAtMs: number | null;
  pausedAtMs: number | null;
  isPlaying: boolean;
  trackVersion: number;

  hydrate: (roomId: string) => Promise<void>;
  applyPlay: (m: { track_id: string | null; started_at_ms: number | null }) => void;
  applyPause: (m: { paused_at_ms: number }) => void;
  applyChange: (m: { track_id: string; started_at_ms: number }) => void;
  reset: () => void;
}

const INITIAL = {
  roomId: null,
  trackId: null,
  trackTitle: null,
  startedAtMs: null,
  pausedAtMs: null,
  isPlaying: false,
} as const;

export const useRoomPlaybackStore = create<RoomPlaybackState>((set, get) => ({
  ...INITIAL,
  trackVersion: 0,

  async hydrate(roomId) {
    set({ ...INITIAL, roomId, trackVersion: get().trackVersion + 1 });
    try {
      const snap = await roomPlaybackApi.getByRoom(roomId);
      if (get().roomId !== roomId) return;
      if (!snap) {
        set({ trackId: null, trackTitle: null });
        return;
      }
      set({
        trackId: snap.current_track_id,
        trackTitle: snap.track?.title ?? null,
        startedAtMs: snap.started_at_ms,
        pausedAtMs: snap.paused_at_ms,
        isPlaying: snap.is_playing,
        trackVersion: get().trackVersion + 1,
      });
    } catch {
      // Visibility-gated 403 / network hiccup — leave room silent.
    }
  },

  applyPlay({ track_id, started_at_ms }) {
    const prev = get();
    const trackChanged = track_id !== prev.trackId;
    set({
      trackId: track_id,
      trackTitle: trackChanged ? null : prev.trackTitle,
      startedAtMs: started_at_ms,
      pausedAtMs: null,
      isPlaying: true,
      trackVersion: trackChanged ? prev.trackVersion + 1 : prev.trackVersion,
    });
  },

  applyPause({ paused_at_ms }) {
    set({ isPlaying: false, pausedAtMs: paused_at_ms });
  },

  applyChange({ track_id, started_at_ms }) {
    set({
      trackId: track_id,
      trackTitle: null,
      startedAtMs: started_at_ms,
      pausedAtMs: null,
      isPlaying: true,
      trackVersion: get().trackVersion + 1,
    });
  },

  reset() {
    set({ ...INITIAL, trackVersion: get().trackVersion + 1 });
  },
}));

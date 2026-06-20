"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import {
  personalRadioApi,
  type PersonalPlaylistContext,
  type PersonalPlaylistTrack,
} from "@/lib/api/endpoints";
import {
  clearAudioUnlocked,
  isAudioUnlocked,
  markAudioUnlocked,
} from "@/lib/audio/unlock";
import { getPlayUrl, isLocalTrackId, localUrl } from "@/lib/audio/playUrlCache";

/**
 * Global audio state.
 *
 * Single source of truth for every music UI surface in the app:
 *   • `<MusicPlayer>` (town BottomHUD)
 *   • `<FloatingMusicPlayer>` (solo /focus page)
 *   • `<PersonalRadio>` (room scenes)
 *
 * SOLID rationale:
 *   • SRP — owns state only; the I/O sync to the DOM `<audio>` element
 *     lives in `<GlobalAudioMount>` (one place, mounted once).
 *   • DIP — UI components dispatch typed actions; they never touch
 *     `HTMLAudioElement`. The mount is the single boundary that turns
 *     declarative state into imperative DOM calls.
 *   • OCP — adding a new player surface = a new pure-UI consumer that
 *     reads selectors; no edits to this store, no edits to the mount.
 *
 * Persistence whitelist: `isPlaying`, `volume`, `hidden` only. Track
 * data is server-randomized per-day and re-fetched on context change;
 * persisting it would defeat that. `audioUnlocked` mirrors
 * sessionStorage (one-tab scope) and is set from `<GlobalAudioMount>`
 * on first mount, not by persist.
 */

// Local fallback used when the backend playlist returns empty. IDs
// prefixed `local:` route through `resolveTrackSrc` to static
// `/audio/*.mp3` files in the frontend public dir — guarantees the
// player never sits idle even on a cold cache or backend hiccup.
export const LOCAL_FALLBACK_TRACKS: PersonalPlaylistTrack[] = [
  {
    id: "local:lofi-1",
    title: "Lo-fi Drift",
    artist: "Local",
    mood: "lofi",
    duration_ms: 180_000,
    content_type: "audio/mpeg",
  },
  {
    id: "local:lofi-2",
    title: "Pixel Cafe",
    artist: "Local",
    mood: "lofi",
    duration_ms: 180_000,
    content_type: "audio/mpeg",
  },
  {
    id: "local:lofi-3",
    title: "Night Commute",
    artist: "Local",
    mood: "lofi",
    duration_ms: 180_000,
    content_type: "audio/mpeg",
  },
];

/** Resolve a track id to a playable URL. Local fallback tracks are
 *  synchronous (static `/audio/*.mp3` from /public); backend tracks
 *  resolve through `playUrlCache.getPlayUrl` which lazily issues +
 *  caches a signed JWT URL. Callers that need the backend URL must
 *  await `resolveTrackSrcAsync`. */
export function resolveTrackSrc(track: PersonalPlaylistTrack | null): string {
  if (!track) return "";
  if (isLocalTrackId(track.id)) return localUrl(track.id);
  return ""; // backend tracks resolve via `resolveTrackSrcAsync`
}

export async function resolveTrackSrcAsync(
  track: PersonalPlaylistTrack | null,
): Promise<string> {
  if (!track) return "";
  if (isLocalTrackId(track.id)) return localUrl(track.id);
  return getPlayUrl(track.id);
}

interface AudioState {
  // Playlist
  context: PersonalPlaylistContext | null;
  contextId: string | null;
  tracks: PersonalPlaylistTrack[];
  index: number;
  // Playback intent
  isPlaying: boolean;
  volume: number; // [0, 1]
  /** When true, the singleton ``<audio>`` element runs muted. Mirrors
   *  the cohort-station "immersion or step out" rule: no user-facing
   *  pause anywhere; the only "make it stop" affordance is mute (or
   *  navigate away). ``muted`` is independent of ``audioUnlocked`` —
   *  the latter is the browser-autoplay-policy gate, this is the
   *  user-driven silence flag. */
  muted: boolean;
  audioUnlocked: boolean;
  // Floating player chrome
  hidden: boolean;
  // Actions
  setContext: (
    context: PersonalPlaylistContext,
    contextId?: string | null,
  ) => Promise<void>;
  setTracks: (tracks: PersonalPlaylistTrack[]) => void;
  /** Legacy play/pause actions kept for backwards compat with existing
   *  tests and the GlobalAudioMount's audio-store branch. UI must NOT
   *  expose these — per product, the only silence control is ``muted``. */
  play: () => void;
  pause: () => void;
  toggle: () => void;
  toggleMute: () => void;
  next: () => void;
  prev: () => void;
  setVolume: (v: number) => void;
  unlock: () => void;
  setUnlocked: (v: boolean) => void;
  setHidden: (v: boolean) => void;
}

export const useAudioStore = create<AudioState>()(
  persist(
    (set, get) => ({
      context: null,
      contextId: null,
      tracks: [],
      index: 0,
      isPlaying: false,
      volume: 0.65,
      muted: false,
      audioUnlocked: false,
      hidden: false,

      setContext: async (context, contextId = null) => {
        const prev = get();
        // Idempotent — re-setting the same (context, contextId) is a no-op
        // so navigating between pages that share a context (city ↔ city)
        // doesn't refetch + restart playback.
        if (prev.context === context && prev.contextId === contextId) return;
        set({ context, contextId });
        try {
          const res = await personalRadioApi.getPlaylist({ context, contextId });
          const next =
            res.tracks.length > 0 ? res.tracks : LOCAL_FALLBACK_TRACKS;
          // Preserve the persisted index so returning users resume where they
          // left off (playlist is stable within a day). Clamp to new length.
          const restoredIndex = Math.min(get().index, next.length - 1);
          set({ tracks: next, index: restoredIndex });
        } catch {
          // Network hiccup — keep whatever we had; the mount will retry
          // by replaying the current track. If we had nothing, fall back
          // to the static local set so the player never reads "empty".
          if (get().tracks.length === 0) {
            set({ tracks: LOCAL_FALLBACK_TRACKS, index: 0 });
          }
        }
      },

      setTracks: (tracks) => set({ tracks, index: 0 }),

      play: () => {
        const { audioUnlocked } = get();
        // Calling `play` while still locked is a soft no-op — we record
        // the intent (isPlaying=true) so the mount can call .play() the
        // instant unlock() fires.
        set({ isPlaying: true });
        if (!audioUnlocked && typeof window !== "undefined") {
          // Best-effort: a play action IS a user gesture, so unlock here.
          markAudioUnlocked();
          set({ audioUnlocked: true });
        }
      },

      pause: () => set({ isPlaying: false }),

      toggle: () => {
        const { isPlaying, audioUnlocked } = get();
        if (!audioUnlocked) {
          markAudioUnlocked();
          set({ audioUnlocked: true, isPlaying: true });
          return;
        }
        set({ isPlaying: !isPlaying });
      },

      toggleMute: () => {
        const { muted, audioUnlocked } = get();
        // First mute-button click on a locked page also counts as the
        // browser-autoplay unlock gesture, so the element starts playing
        // (muted, then audible once they un-mute).
        if (!audioUnlocked) {
          markAudioUnlocked();
          set({
            audioUnlocked: true,
            isPlaying: true,
            muted: !muted,
          });
          return;
        }
        set({ muted: !muted });
      },

      next: () => {
        const { tracks, index } = get();
        if (tracks.length === 0) return;
        set({ index: (index + 1) % tracks.length, isPlaying: true });
      },

      prev: () => {
        const { tracks, index } = get();
        if (tracks.length === 0) return;
        set({
          index: (index - 1 + tracks.length) % tracks.length,
          isPlaying: true,
        });
      },

      setVolume: (v) => set({ volume: Math.max(0, Math.min(1, v)) }),

      unlock: () => {
        markAudioUnlocked();
        set({ audioUnlocked: true, isPlaying: true });
      },

      setUnlocked: (v) => {
        if (v) markAudioUnlocked();
        else clearAudioUnlocked();
        set({ audioUnlocked: v });
      },

      setHidden: (v) => set({ hidden: v }),
    }),
    {
      name: "lbt.audio.v1",
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") {
          // SSR-safe no-op storage; persist middleware reads it during
          // hydration but ignores empty values. The real read happens
          // client-side after mount.
          return {
            getItem: () => null,
            setItem: () => undefined,
            removeItem: () => undefined,
          };
        }
        return window.localStorage;
      }),
      // Persist user controls + track index so returning users resume the
      // same track. Playlist data is server-authoritative; index is clamped
      // to the new list length in setContext on each load.
      partialize: (s) => ({
        isPlaying: s.isPlaying,
        volume: s.volume,
        muted: s.muted,
        hidden: s.hidden,
        index: s.index,
      }),
      // On rehydration, sync `audioUnlocked` from sessionStorage so the
      // mount's first effect already has the right gate state.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (typeof window !== "undefined") {
          state.audioUnlocked = isAudioUnlocked();
        }
      },
      version: 1,
    },
  ),
);

/** Derived: the currently-selected track or null when the playlist is empty. */
export function selectCurrentTrack(
  s: AudioState,
): PersonalPlaylistTrack | null {
  return s.tracks[s.index] ?? null;
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  personalRadioApi,
  tracksApi,
  type PersonalPlaylistContext,
  type PersonalPlaylistTrack,
} from "@/lib/api/endpoints";
import {
  clearAudioUnlocked,
  isAudioUnlocked,
  markAudioUnlocked,
} from "@/lib/audio/unlock";

interface UseRadioPlaylistOptions {
  context: PersonalPlaylistContext;
  contextId?: string | null;
  /** Initial volume in [0, 1]. Defaults to 0.65 to match PersonalRadio's
   *  pre-extraction default. */
  initialVolume?: number;
}

// Local fallback playlist used when the backend `/playback/playlist`
// endpoint returns an empty list or fails. Lets dev / demo / offline mode
// play music without backend seeding. Track ids carry a `local:` prefix
// so the bind effect can route them to static `/audio/*.mp3` files
// instead of `tracksApi.streamUrl()`.
const LOCAL_FALLBACK_TRACKS: PersonalPlaylistTrack[] = [
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
const LOCAL_TRACK_URL: Record<string, string> = {
  "local:lofi-1": "/audio/lofi-1.mp3",
  "local:lofi-2": "/audio/lofi-2.mp3",
  "local:lofi-3": "/audio/lofi-3.mp3",
};

export interface RadioPlaylistState {
  /** Tracks from `/playback/playlist`, in playback order. Empty until fetch. */
  tracks: PersonalPlaylistTrack[];
  /** Current track index; clamped to 0 when `tracks` is empty. */
  index: number;
  /** `tracks[index]` or null when the playlist is empty. */
  currentTrack: PersonalPlaylistTrack | null;
  /** Whether the user has gestured to unlock browser audio. Browsers
   *  block `audio.play()` without a prior gesture; the splash signin
   *  click also pre-unlocks via `markAudioUnlocked()`. */
  audioUnlocked: boolean;
  /** Whether playback is intended (effectively `audio.paused === false`
   *  when unlocked + track exists). */
  isPlaying: boolean;
  /** 0–1 volume. */
  volume: number;
  /** Ref the consumer must attach to its `<audio>` element. The hook
   *  syncs play/pause/src against this ref. */
  audioRef: React.MutableRefObject<HTMLAudioElement | null>;
  /** Action: toggle play / pause. Auto-unlocks audio if the user
   *  gesture happens here. */
  toggle: () => void;
  /** Action: explicit unlock (e.g. dedicated "🔊 點擊聆聽" button). */
  unlock: () => void;
  /** Action: next track (wraps to 0 at end). */
  next: () => void;
  /** Action: previous track (wraps to end at start). */
  prev: () => void;
  /** Action: change volume (range 0–1). */
  setVolume: (next: number) => void;
  /** Bind to the `<audio>` element's `onEnded` to auto-advance. */
  onEnded: () => void;
}

/**
 * Server-randomized per-user radio playlist with audio playback state.
 *
 * Shared infrastructure between:
 *   • `<PersonalRadio>` (`components/audio/PersonalRadio.tsx`) — used by
 *     `/focus/[id]` and `/town/room/[id]`
 *   • `<MusicPlayer>` (`components/town/bottom/MusicPlayer.tsx`) — the
 *     reference-aligned town BottomHUD widget
 *
 * SOLID-aligned:
 *   • **SRP** — hook owns "playlist + playback state"; consumers own
 *     visual chrome and decide which `<audio>` element to mount.
 *   • **DIP** — depends on `personalRadioApi` and `tracksApi` (endpoint
 *     wrappers); no direct `fetch`.
 *   • Consumers stay simple — render `<audio ref={state.audioRef}
 *     onEnded={state.onEnded} style={{ display: 'none' }} />` plus
 *     transport buttons wired to `toggle / next / prev`.
 *
 * **Important — single audio element per route**: each route should
 * mount exactly one consumer of this hook (or one component rendering
 * the `<audio>` element). Mounting two on the same page = two audio
 * sources playing in parallel.
 */
export function useRadioPlaylist({
  context,
  contextId,
  initialVolume = 0.65,
}: UseRadioPlaylistOptions): RadioPlaylistState {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [tracks, setTracks] = useState<PersonalPlaylistTrack[]>([]);
  const [index, setIndex] = useState(0);
  const [audioUnlocked, setAudioUnlocked] = useState(isAudioUnlocked);
  const [isPlaying, setIsPlaying] = useState(() => isAudioUnlocked());
  const [volume, setVolumeState] = useState(initialVolume);

  // Fetch playlist on mount + when context changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await personalRadioApi.getPlaylist({
          context,
          contextId: contextId ?? null,
        });
        if (cancelled) return;
        setTracks(res.tracks.length > 0 ? res.tracks : LOCAL_FALLBACK_TRACKS);
        setIndex(0);
      } catch {
        if (!cancelled) {
          setTracks(LOCAL_FALLBACK_TRACKS);
          setIndex(0);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [context, contextId]);

  const currentTrack = tracks[index] ?? null;

  // Bind audio element to current track + play state.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (!currentTrack) {
      el.pause();
      el.removeAttribute("src");
      return;
    }
    const desired = currentTrack.id.startsWith("local:")
      ? LOCAL_TRACK_URL[currentTrack.id] ?? ""
      : tracksApi.streamUrl(currentTrack.id);
    if (el.src !== desired) {
      el.src = desired;
      el.load();
    }
    el.volume = volume;
    if (isPlaying && audioUnlocked) {
      void el.play().catch((err) => {
        if (err?.name === "NotAllowedError") {
          setAudioUnlocked(false);
          clearAudioUnlocked();
        }
      });
    } else {
      el.pause();
    }
  }, [currentTrack, isPlaying, audioUnlocked, volume]);

  const next = () => {
    if (tracks.length === 0) return;
    setIndex((i) => (i + 1) % tracks.length);
    setIsPlaying(true);
  };

  const prev = () => {
    if (tracks.length === 0) return;
    setIndex((i) => (i - 1 + tracks.length) % tracks.length);
    setIsPlaying(true);
  };

  const unlock = () => {
    setAudioUnlocked(true);
    markAudioUnlocked();
    setIsPlaying(true);
  };

  const toggle = () => {
    if (!audioUnlocked) {
      unlock();
      return;
    }
    setIsPlaying((p) => !p);
  };

  return useMemo<RadioPlaylistState>(
    () => ({
      tracks,
      index,
      currentTrack,
      audioUnlocked,
      isPlaying,
      volume,
      audioRef,
      toggle,
      unlock,
      next,
      prev,
      setVolume: setVolumeState,
      onEnded: next,
    }),
    // `next` / `prev` / `toggle` / `unlock` close over state; useMemo
    // captures the latest closures on every render. That's intentional —
    // the actions stay stable enough for consumer JSX without us paying
    // for `useCallback` per-action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tracks, index, currentTrack, audioUnlocked, isPlaying, volume],
  );
}

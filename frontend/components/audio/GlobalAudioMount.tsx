"use client";

import { useEffect, useRef } from "react";

import {
  resolveTrackSrc,
  selectCurrentTrack,
  useAudioStore,
} from "@/lib/state/audioStore";
import { clearAudioUnlocked, isAudioUnlocked } from "@/lib/audio/unlock";

/**
 * Singleton audio mount — the ONLY place in the app that touches an
 * `HTMLAudioElement`. Mounted exactly once in the locale layout so it
 * survives page navigation; React never unmounts it between route
 * transitions, so playback continues seamlessly.
 *
 * Side-effects only — renders an `<audio>` node hidden via display:none
 * so it has zero visual presence. All UI surfaces (MusicPlayer,
 * FloatingMusicPlayer, PersonalRadio) read the store and dispatch
 * actions; this component is the bridge that turns declarative state
 * into imperative `.play()` / `.pause()` / `.src=` calls.
 *
 * Hydration discipline:
 *   • Initial render returns the audio element only; effects run on
 *     the client after rehydration so SSR/CSR don't diverge.
 *   • `audioUnlocked` is read from sessionStorage exactly once on mount
 *     (matches the round-2 fix for React #418).
 */
export function GlobalAudioMount() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Sync `audioUnlocked` from sessionStorage on first mount. The store's
  // persist `onRehydrateStorage` also handles this, but covering both
  // paths is cheap and defends against any race where the audio mount
  // renders before the persist hydration tick.
  useEffect(() => {
    if (isAudioUnlocked()) {
      useAudioStore.setState({ audioUnlocked: true });
    }
  }, []);

  // Watch the currently-selected track and bind its src to the audio
  // element. `el.load()` resets playback to the start of the new media.
  useEffect(() => {
    const unsubscribe = useAudioStore.subscribe((state, prev) => {
      const el = audioRef.current;
      if (!el) return;

      const currentTrack = selectCurrentTrack(state);
      const prevTrack = selectCurrentTrack(prev);

      // 1. Track changed → swap src.
      if (currentTrack?.id !== prevTrack?.id) {
        if (!currentTrack) {
          el.pause();
          el.removeAttribute("src");
        } else {
          const src = resolveTrackSrc(currentTrack);
          if (src && el.src !== src) {
            el.src = src;
            el.load();
          }
        }
      }

      // 2. Volume changed → update the element. Audio element accepts
      //    values [0,1]; the store guarantees this clamp.
      if (state.volume !== prev.volume) {
        el.volume = state.volume;
      }

      // 3. Playback intent changed (or unlock state flipped) → resolve.
      const wantPlay = state.isPlaying && state.audioUnlocked;
      const wasPlay = prev.isPlaying && prev.audioUnlocked;
      if (wantPlay !== wasPlay) {
        if (wantPlay) {
          void el.play().catch((err) => {
            // NotAllowedError: the browser rejected play despite our
            // unlock flag — clear and let the user re-gesture. Anything
            // else (decode error, network) just leaves the element
            // paused with the broken src; surface in console only.
            if (err?.name === "NotAllowedError") {
              clearAudioUnlocked();
              useAudioStore.setState({
                audioUnlocked: false,
                isPlaying: false,
              });
            }
          });
        } else {
          el.pause();
        }
      }
    });
    return unsubscribe;
  }, []);

  // Initial bind: when the audio element first mounts, push the store's
  // current state into the DOM. Subsequent updates flow through the
  // subscribe block above. This handles the case where the user reloads
  // the page with persisted (isPlaying=true, volume=0.65) — the mount
  // sets up src and volume, but only auto-plays once audioUnlocked is
  // true (which requires a fresh gesture per tab, since unlock is
  // sessionStorage-scoped).
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const state = useAudioStore.getState();
    el.volume = state.volume;
    const track = selectCurrentTrack(state);
    if (track) {
      const src = resolveTrackSrc(track);
      if (src && el.src !== src) {
        el.src = src;
        el.load();
      }
    }
    if (state.isPlaying && state.audioUnlocked) {
      void el.play().catch((err) => {
        if (err?.name === "NotAllowedError") {
          clearAudioUnlocked();
          useAudioStore.setState({
            audioUnlocked: false,
            isPlaying: false,
          });
        }
      });
    }
  }, []);

  const onEnded = () => useAudioStore.getState().next();

  return (
    <audio
      ref={audioRef}
      preload="metadata"
      onEnded={onEnded}
      style={{ display: "none" }}
      aria-hidden
    />
  );
}

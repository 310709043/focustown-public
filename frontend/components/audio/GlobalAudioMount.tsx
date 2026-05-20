"use client";

import { useEffect, useRef } from "react";

import {
  LOCAL_FALLBACK_TRACKS,
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
  // Tracks which playlist ids have failed within a tight window. Once every
  // track in the current playlist has thrown at least once in the same
  // ~800 ms burst, we stop the rapid-cycle and swap to LOCAL_FALLBACK_TRACKS
  // so the user actually hears something instead of watching the index
  // flicker through every dead presigned URL.
  const errorBudget = useRef<{ failed: Set<string>; lastAt: number }>({
    failed: new Set(),
    lastAt: 0,
  });

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

  // Defensive handler — a track src can fail for reasons outside our
  // control: expired S3 presigned URL, transient 5xx from the backend,
  // CSP media-src not yet propagated after a deploy, a track row whose
  // file was pruned from object storage. Without this hook a dead src
  // produces silent failure: no UI feedback, no recovery, no signal in
  // logs. Here we (a) emit a console.warn with the track id + numeric
  // error code so AWS dev triage isn't guesswork, and (b) auto-advance
  // so one bad URL doesn't poison the rest of the playlist.
  //
  // Privacy: we deliberately log only the track id (a UUID — not
  // sensitive) and the integer error code. The full `audioRef.src`
  // contains the presigned signature and MUST NOT be logged.
  const onError = () => {
    const s = useAudioStore.getState();
    const t = selectCurrentTrack(s);
    const code = audioRef.current?.error?.code;
    console.warn("[audio] media error", { trackId: t?.id ?? null, code });
    if (!t) return;

    // Reset the "failed this burst" set whenever errors stop coming for a
    // beat — a one-off transient on a healthy playlist shouldn't poison
    // future cycles.
    const now = performance.now();
    if (now - errorBudget.current.lastAt > 800) {
      errorBudget.current.failed.clear();
    }
    errorBudget.current.lastAt = now;
    errorBudget.current.failed.add(t.id);

    // If every track in the current playlist has failed at least once in
    // this burst, advancing won't help — swap to the static local fallback
    // so the user hears actual audio instead of rapid-cycling silence.
    if (errorBudget.current.failed.size >= s.tracks.length) {
      console.warn(
        "[audio] all tracks failed; switching to local fallback",
      );
      useAudioStore.setState({ tracks: LOCAL_FALLBACK_TRACKS, index: 0 });
      errorBudget.current.failed.clear();
      return;
    }
    if (s.tracks.length > 1) s.next();
  };

  return (
    <audio
      ref={audioRef}
      preload="metadata"
      // `anonymous` keeps the request unauthenticated (no cookies sent
      // cross-origin) but enables proper `error` event delivery for
      // cross-origin redirects, which is what the S3 presigned flow is.
      crossOrigin="anonymous"
      onEnded={onEnded}
      onError={onError}
      style={{ display: "none" }}
      aria-hidden
    />
  );
}

"use client";

import { useEffect, useRef } from "react";

import {
  LOCAL_FALLBACK_TRACKS,
  resolveTrackSrc,
  resolveTrackSrcAsync,
  selectCurrentTrack,
  useAudioStore,
} from "@/lib/state/audioStore";
import {
  scopeKey,
  selectActivePlaylistIds,
  useStationStore,
  type StationCursor,
  type StationTrackMeta,
} from "@/lib/state/stationStore";
import {
  clearAudioUnlocked,
  isAudioUnlocked,
  markAudioUnlocked,
} from "@/lib/audio/unlock";
import { getPlayUrl, invalidate as invalidatePlayUrl } from "@/lib/audio/playUrlCache";

/**
 * Singleton audio mount — the ONLY place in the app that touches an
 * `HTMLAudioElement`. Mounted exactly once in the locale layout so it
 * survives page navigation; React never unmounts it between route
 * transitions, so playback continues seamlessly.
 *
 * Source-selector hierarchy (decided per state-change tick):
 *   1. activeScope set + connection === "connected"
 *      → shared cohort station (cursor-driven, no per-user controls)
 *   2. activeScope set + connection === "disconnected"
 *      → personal shuffled playlist from stationStore (prev/next/mute)
 *   3. no activeScope → existing audioStore path
 *      (covers /focus/solo, library, splash)
 *
 * Explicit room visits (``/room/{id}``) keep their own ``<audio>``
 * element inside ``<SyncedRoomPlayer/>``; this mount does not touch
 * them. Source-1 and source-2 use a 400ms volume crossfade so the
 * connect/disconnect toggle feels like stepping in / out of a circle,
 * not a hard cut.
 */

type Source =
  | { kind: "station"; trackId: string; durationMs: number; offsetMs: number }
  | { kind: "personal"; trackId: string | null; muted: boolean }
  | { kind: "audio-store"; trackId: string | null };

const CROSSFADE_MS = 200;

function stationOffsetMs(
  cursor: StationCursor,
  tracksById: Record<string, StationTrackMeta>,
  trackId: string,
  now: number,
): { offset: number; duration: number } {
  let anchorMs = cursor.startedAtMs;
  let index = cursor.cursorIndex;
  const len = cursor.playlistIds.length;
  for (let step = 0; step < len; step += 1) {
    const tid = cursor.playlistIds[index];
    const duration = tracksById[tid]?.durationMs ?? 180_000;
    if (tid === trackId && now >= anchorMs && now < anchorMs + duration) {
      return { offset: Math.max(0, now - anchorMs), duration };
    }
    anchorMs += duration;
    index = (index + 1) % len;
  }
  return { offset: 0, duration: 180_000 };
}

function selectSource(): Source {
  const ss = useStationStore.getState();
  const as = useAudioStore.getState();
  const { activeScope } = ss;

  if (activeScope) {
    const key = scopeKey(activeScope);
    const connection = ss.connection[key] ?? "connected";

    if (connection === "connected") {
      const cursor = ss.getCursorFor(activeScope);
      const trackId = cursor ? ss.getCurrentTrackId(Date.now()) : null;
      if (cursor && trackId) {
        const { offset, duration } = stationOffsetMs(
          cursor,
          ss.tracksById,
          trackId,
          Date.now(),
        );
        return { kind: "station", trackId, durationMs: duration, offsetMs: offset };
      }
      // Cursor hasn't arrived yet — fall through to personal/audio-store
      // rather than producing silence on the splash.
    } else {
      const trackId =
        ss.personalPlaylist[ss.personalIndex]?.id ?? null;
      return {
        kind: "personal",
        trackId,
        muted: ss.mutedWhileDisconnected,
      };
    }
  }

  return {
    kind: "audio-store",
    trackId: selectCurrentTrack(as)?.id ?? null,
  };
}

async function srcForSource(src: Source): Promise<string> {
  if (src.kind === "station") return getPlayUrl(src.trackId);
  if (src.kind === "personal") {
    const ss = useStationStore.getState();
    const track = ss.personalPlaylist[ss.personalIndex];
    if (!track) return "";
    if (track.id.startsWith("local:")) return resolveTrackSrc(track);
    return getPlayUrl(track.id);
  }
  const as = useAudioStore.getState();
  return resolveTrackSrcAsync(selectCurrentTrack(as));
}

function currentTrackId(src: Source): string | null {
  if (src.kind === "station") return src.trackId;
  if (src.kind === "personal") return src.trackId;
  const as = useAudioStore.getState();
  return selectCurrentTrack(as)?.id ?? null;
}

function targetVolume(src: Source): number {
  const as = useAudioStore.getState();
  if (src.kind === "station") {
    // Connected = full immersion. Volume slider is hidden, but we honor
    // a max ceiling of the user's last-set volume so a rejoiner doesn't
    // suddenly get blasted if they happened to have it loud before.
    return Math.min(1, Math.max(0.5, as.volume));
  }
  if (src.kind === "personal") {
    return src.muted ? 0 : as.volume;
  }
  return as.volume;
}

function rampVolume(el: HTMLAudioElement, target: number, ms: number): void {
  const start = el.volume;
  const startTs = performance.now();
  const step = () => {
    const elapsed = performance.now() - startTs;
    const t = Math.min(1, elapsed / ms);
    el.volume = start + (target - start) * t;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function GlobalAudioMount() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentIdentityRef = useRef<string>("");
  const lastSourceKindRef = useRef<Source["kind"] | null>(null);
  // Monotonic counter so async URL fetches that resolve after a newer
  // apply() pass can drop their stale result without touching <audio>.
  const applyTokenRef = useRef<number>(0);
  // Tracks which playlist ids have failed within a tight window. Once every
  // track in the current playlist has thrown at least once in the same
  // ~800 ms burst, the audio-store path swaps to LOCAL_FALLBACK_TRACKS so
  // the user actually hears something instead of watching the index flicker
  // through every dead presigned URL. Only applies to the audio-store
  // branch — station/personal have their own recovery paths.
  const errorBudget = useRef<{ failed: Set<string>; lastAt: number }>({
    failed: new Set(),
    lastAt: 0,
  });

  // Sync audio unlock from sessionStorage on first mount.
  useEffect(() => {
    if (isAudioUnlocked()) {
      useAudioStore.setState({ audioUnlocked: true });
    }
  }, []);

  // One-shot: the first user gesture on /town doubles as the audio
  // unlock. Muted autoplay already had the element playing — this
  // listener flips `muted` off + sets the store flag so future apply()
  // ticks no longer force-mute. Same listener still handles the legacy
  // "first gesture also calls play()" path when nothing was autoplayed
  // (audio-store branch outside an active scope).
  useEffect(() => {
    if (isAudioUnlocked()) return;
    const tryUnlock = () => {
      const el = audioRef.current;
      if (el) {
        el.muted = false;
        if (el.src && el.paused) {
          void el.play().catch(() => {});
        }
      }
      markAudioUnlocked();
      useAudioStore.setState({ audioUnlocked: true });
      document.removeEventListener("pointerdown", tryUnlock, true);
      document.removeEventListener("keydown", tryUnlock, true);
      document.removeEventListener("touchstart", tryUnlock, true);
    };
    document.addEventListener("pointerdown", tryUnlock, true);
    document.addEventListener("keydown", tryUnlock, true);
    document.addEventListener("touchstart", tryUnlock, true);
    return () => {
      document.removeEventListener("pointerdown", tryUnlock, true);
      document.removeEventListener("keydown", tryUnlock, true);
      document.removeEventListener("touchstart", tryUnlock, true);
    };
  }, []);

  // Re-evaluate the source whenever either store changes. Both stores
  // share one audio element; the selector decides which one drives.
  useEffect(() => {
    const swapSrc = (
      el: HTMLAudioElement,
      src: Source,
      url: string,
    ): void => {
      if (url) {
        el.src = url;
        el.load();
        if (src.kind === "station") {
          el.currentTime = Math.max(0, src.offsetMs / 1000);
        } else {
          el.currentTime = 0;
        }
      } else {
        el.removeAttribute("src");
        el.load();
      }
    };

    const applyPlaybackIntent = (el: HTMLAudioElement, src: Source): void => {
      const as = useAudioStore.getState();
      // Element is muted when (a) the browser-autoplay gate hasn't
      // cleared yet, OR (b) the user clicked mute. (a) is required so
      // ``el.play()`` doesn't reject with NotAllowedError on first
      // load; (b) is the only user-visible silence control (no
      // play/pause anywhere in the UI — see feedback-no-music-pause).
      const desiredMuted = !as.audioUnlocked || as.muted;
      if (el.muted !== desiredMuted) el.muted = desiredMuted;
      const wantPlay = (() => {
        // Every audio source autoplays once the audio is unlocked. The
        // audio-store branch (solo focus, splash, library) used to gate
        // on ``isPlaying && audioUnlocked`` because users could pause —
        // now the only "stop the sound" affordance is mute, so the
        // element keeps running and ``muted`` carries the user's intent.
        if (src.kind === "station") return true;
        if (src.kind === "personal") return true;
        return as.audioUnlocked;
      })();
      if (wantPlay && el.paused) {
        void el.play().catch((err) => {
          if (err?.name === "NotAllowedError") {
            clearAudioUnlocked();
            useAudioStore.setState({
              audioUnlocked: false,
              isPlaying: false,
            });
          }
        });
      } else if (!wantPlay && !el.paused) {
        el.pause();
      }
    };

    const apply = () => {
      const el = audioRef.current;
      if (!el) return;
      const src = selectSource();
      const tid = currentTrackId(src);
      const identity = `${src.kind}|${tid ?? ""}`;
      const sourceKindChanged = lastSourceKindRef.current !== src.kind;
      const trackChanged = currentIdentityRef.current !== identity;

      if (!(trackChanged || sourceKindChanged)) {
        // Same identity → just keep volume in sync (slider, mute).
        const tv = targetVolume(src);
        if (Math.abs(el.volume - tv) > 0.001) el.volume = tv;
        applyPlaybackIntent(el, src);
        return;
      }

      // Identity changed — bump the token so any in-flight URL fetch
      // started by an earlier apply() drops its result on resolve.
      const myToken = ++applyTokenRef.current;
      currentIdentityRef.current = identity;
      lastSourceKindRef.current = src.kind;

      void srcForSource(src).then((targetSrcUrl) => {
        if (applyTokenRef.current !== myToken) return; // superseded
        const elNow = audioRef.current;
        if (!elNow) return;

        if (sourceKindChanged) {
          // Crossfade only on cross-source switches; same-source track
          // changes (next personal song) hard-swap because they're
          // under direct user intent.
          rampVolume(elNow, 0, CROSSFADE_MS);
          window.setTimeout(() => {
            if (applyTokenRef.current !== myToken) return;
            const el2 = audioRef.current;
            if (!el2) return;
            swapSrc(el2, src, targetSrcUrl);
            const tv = targetVolume(src);
            rampVolume(el2, tv, CROSSFADE_MS);
            applyPlaybackIntent(el2, src);
          }, CROSSFADE_MS);
        } else {
          swapSrc(elNow, src, targetSrcUrl);
          elNow.volume = targetVolume(src);
          applyPlaybackIntent(elNow, src);
        }
      }).catch((err) => {
        // URL fetch failed (e.g. play-token 401 / 404 / network).
        // Onerror path on <audio> won't fire because we never set src,
        // so this is the only place the user-visible "no sound" gets
        // turned into an observable signal. Defer to next apply() —
        // store subscribers will retrigger.
        console.warn("[audio] play-token failed", {
          trackId: currentTrackId(src),
          sourceKind: src.kind,
          err,
        });
      });
    };

    const unStation = useStationStore.subscribe(apply);
    const unAudio = useAudioStore.subscribe(apply);
    // Initial application.
    apply();
    return () => {
      unStation();
      unAudio();
    };
  }, []);

  const onEnded = () => {
    const src = selectSource();
    if (src.kind === "audio-store") {
      useAudioStore.getState().next();
    } else if (src.kind === "personal") {
      useStationStore.getState().nextPersonal();
    }
    // Station mode: the worker's advance_if_due tick publishes the next
    // cursor within ≤5s. The audio element will sit at the end of the
    // track briefly until the new src arrives — acceptable trade vs.
    // letting the client advance early and drift out of sync.
  };

  const onError = () => {
    const el = audioRef.current;
    const code = el?.error?.code;
    const src = selectSource();
    const tid =
      src.kind === "station" || src.kind === "personal"
        ? src.trackId
        : selectCurrentTrack(useAudioStore.getState())?.id ?? null;
    console.warn("[audio] media error", { trackId: tid, code, source: src.kind });

    // Drop the cached signed URL so the next apply() re-issues a fresh
    // play-token. Most playback failures are either a 401 from an
    // expired token (5-min TTL) or a transient network blip; both are
    // resolved by re-fetching. Repeated failures fall through to the
    // burst-window guard below.
    if (tid && !tid.startsWith("local:")) invalidatePlayUrl(tid);

    if (src.kind === "audio-store") {
      // PR #90: per-burst failure tracking. When every track in the
      // current personal-radio playlist has 404'd inside an ~800ms
      // window, advancing further is pointless — swap to the static
      // local fallback so the page actually has audio.
      const s = useAudioStore.getState();
      if (!tid) return;
      const now = performance.now();
      if (now - errorBudget.current.lastAt > 800) {
        errorBudget.current.failed.clear();
      }
      errorBudget.current.lastAt = now;
      errorBudget.current.failed.add(tid);
      if (errorBudget.current.failed.size >= s.tracks.length) {
        console.warn("[audio] all tracks failed; switching to local fallback");
        useAudioStore.setState({ tracks: LOCAL_FALLBACK_TRACKS, index: 0 });
        errorBudget.current.failed.clear();
        return;
      }
      if (s.tracks.length > 1) s.next();
    } else if (src.kind === "personal") {
      // Disconnected personal playlist: apply the same burst-window
      // guard as the audio-store path. Without it, if every track
      // URL is expired/broken the player rapidly cycles through the
      // entire playlist in a tight loop.
      const s = useStationStore.getState();
      if (!tid) return;
      const now2 = performance.now();
      if (now2 - errorBudget.current.lastAt > 800) {
        errorBudget.current.failed.clear();
      }
      errorBudget.current.lastAt = now2;
      errorBudget.current.failed.add(tid);
      if (errorBudget.current.failed.size >= s.personalPlaylist.length) {
        console.warn("[audio] personal all-tracks failed; switching to local fallback");
        s.setPersonalPlaylist(LOCAL_FALLBACK_TRACKS);
        errorBudget.current.failed.clear();
        return;
      }
      if (s.personalPlaylist.length > 1) s.nextPersonal();
    } else if (src.kind === "station") {
      // Normally we lean on the next station.cursor event (≤5s worker
      // tick) to repoint to the next track. But if every track in the
      // visible playlist 404s inside one burst, no future cursor will
      // help — the storage backend is unreachable for this client (S3
      // CORS misconfig, presigned URL expiry, IAM regression, ...).
      // Drop activeScope so the source selector promotes the local
      // lo-fi fallback. The next successful station.cursor that arrives
      // does NOT auto-resume station mode — re-entering /town (or a
      // future reconnect button) re-sets activeScope.
      const playlistIds = selectActivePlaylistIds(useStationStore.getState());
      if (!tid || playlistIds.length === 0) return;
      const now = performance.now();
      if (now - errorBudget.current.lastAt > 800) {
        errorBudget.current.failed.clear();
      }
      errorBudget.current.lastAt = now;
      errorBudget.current.failed.add(tid);
      if (errorBudget.current.failed.size >= playlistIds.length) {
        console.warn(
          "[audio] station all-tracks failed; switching to local fallback",
        );
        useAudioStore.setState({
          tracks: LOCAL_FALLBACK_TRACKS,
          index: 0,
          isPlaying: true,
        });
        useStationStore.setState({ activeScope: null });
        errorBudget.current.failed.clear();
      }
    }
  };

  // crossOrigin intentionally omitted — plain <audio src> plays
  // cross-origin without CORS validation. Setting crossOrigin="anonymous"
  // would force the browser to require Access-Control-Allow-Origin on
  // the redirected S3 object, which is exactly the failure mode that
  // motivated this commit (no music in deployed AWS dev).
  // `muted` defaults true so muted autoplay is permitted before the
  // first user gesture; apply() flips it off as soon as `audioUnlocked`
  // is true (sessionStorage rehydrate or the document-level tryUnlock).
  return (
    <audio
      ref={audioRef}
      preload="metadata"
      muted
      onEnded={onEnded}
      onError={onError}
      style={{ display: "none" }}
      aria-hidden
    />
  );
}

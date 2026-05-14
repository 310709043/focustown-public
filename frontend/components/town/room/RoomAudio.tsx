"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { roomPlaybackApi, roomTracksApi, tracksApi } from "@/lib/api/endpoints";
import type { RoomPlayback, RoomTrack } from "@/lib/api/types.gen";
import { useRealtime } from "@/lib/ws/useRealtime";

/**
 * Phase 9 — shared playback timeline rendered inside `slot:audio`.
 *
 * Server-authoritative: backend holds the canonical (started_at_ms,
 * paused_at_ms, is_playing) tuple; this component computes the expected
 * audio.currentTime locally and seeks if it drifts > 500 ms. UI state
 * always reflects the last WS event, never the optimistic HTTP response,
 * so all listeners — owner included — converge on the same broadcast.
 *
 * SRP: this is the smart container. Drift math + WS-to-audio mapping
 * live here; the visitor "now playing" badge and the owner controls are
 * inline because each is a handful of elements. Promoting them to
 * separate components would be premature without a second consumer.
 *
 * Owner controls (only when `isOwner`):
 *   - play/pause toggle (calls roomPlaybackApi.play / .pause)
 *   - change-track dropdown (sourced from roomTracksApi.list)
 *   - skip ⏭ (computes next track_id from the playlist, calls change)
 *
 * No seek slider — drift correction is purely client-side, so there's
 * no UI affordance to send a server-side seek (which the backend
 * intentionally doesn't expose, see plan §B4).
 */

type Props = {
  roomId: string;
  isOwner: boolean;
};

const DRIFT_THRESHOLD_MS = 500;
const DRIFT_CHECK_INTERVAL_MS = 1000;

/**
 * Given the playback state and the current wall-clock, what `currentTime`
 * (in ms) should the audio element be at? Mirrors the backend timeline
 * math so we never need a round-trip just to know "where am I now".
 */
function expectedMs(state: RoomPlayback | null, nowMs: number): number {
  if (!state || state.started_at_ms === null) return 0;
  if (state.is_playing) {
    return Math.max(0, nowMs - state.started_at_ms);
  }
  if (state.paused_at_ms !== null) {
    return Math.max(0, state.paused_at_ms - state.started_at_ms);
  }
  return 0;
}

export function RoomAudio({ roomId, isOwner }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<RoomPlayback | null>(null);
  const [playlist, setPlaylist] = useState<RoomTrack[]>([]);
  const [busy, setBusy] = useState(false);

  // Hydrate the playlist (so the owner's dropdown has options) and the
  // current playback snapshot (so freshly-joining listeners line up
  // before the next WS event arrives).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snapshot = await roomPlaybackApi.getByRoom(roomId);
        if (!cancelled) setState(snapshot);
      } catch {
        // Visitor on an invite_only room — render nothing.
      }
      if (isOwner) {
        try {
          const rows = await roomTracksApi.list();
          if (!cancelled) setPlaylist(rows);
        } catch {
          /* tolerate transient failures; the owner can retry. */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, isOwner]);

  // WS subscription — every listener (owner + visitors) converges on
  // the broadcast. UI state never updates from the HTTP response of an
  // owner action; we wait for the echo so the source of truth is single.
  useRealtime((msg) => {
    if (msg.type === "music.play" && msg.room_id === roomId) {
      setState((prev) => {
        if (!prev) {
          return {
            id: "ws-play",
            room_id: roomId,
            current_track_id: (msg.track_id as string | null) ?? null,
            started_at_ms: (msg.started_at_ms as number | null) ?? null,
            paused_at_ms: null,
            is_playing: true,
            track: null,
          };
        }
        return {
          ...prev,
          current_track_id:
            (msg.track_id as string | null) ?? prev.current_track_id,
          started_at_ms:
            (msg.started_at_ms as number | null) ?? prev.started_at_ms,
          paused_at_ms: null,
          is_playing: true,
        };
      });
    } else if (msg.type === "music.pause" && msg.room_id === roomId) {
      setState((prev) =>
        prev === null
          ? null
          : {
              ...prev,
              paused_at_ms: Number(msg.paused_at_ms),
              is_playing: false,
            },
      );
    } else if (msg.type === "music.change" && msg.room_id === roomId) {
      // Re-fetch the snapshot so the denormalized `track` metadata
      // (title for the "now playing" badge) updates without us
      // duplicating the track lookup logic here.
      void roomPlaybackApi.getByRoom(roomId).then((fresh) => {
        if (fresh) setState(fresh);
      });
    }
  });

  // Bind the audio element to the current state — set src on track
  // change, play/pause to match is_playing, and seek to the expected
  // timeline position whenever the state's timeline fields shift.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (!state || !state.current_track_id) {
      el.pause();
      el.removeAttribute("src");
      return;
    }
    const desiredSrc = tracksApi.streamUrl(state.current_track_id);
    if (el.src !== desiredSrc) {
      el.src = desiredSrc;
    }
    const expected = expectedMs(state, Date.now()) / 1000;
    if (Math.abs(el.currentTime - expected) > DRIFT_THRESHOLD_MS / 1000) {
      el.currentTime = expected;
    }
    if (state.is_playing) {
      void el.play().catch(() => {
        // Autoplay block on freshly-loaded page — the user has to click
        // *something* to unlock audio. Visitor sees their UI flicker
        // play→pause; owner's next deliberate play() will succeed.
      });
    } else {
      el.pause();
    }
  }, [state]);

  // Drift-correction loop. Re-evaluates expectedMs every tick and
  // nudges audio.currentTime back when it slips. Only runs while
  // is_playing — pause keeps the element pinned at paused_at_ms, no
  // correction needed.
  useEffect(() => {
    if (!state?.is_playing) return;
    const id = setInterval(() => {
      const el = audioRef.current;
      if (!el || el.paused) return;
      const expected = expectedMs(state, Date.now()) / 1000;
      if (Math.abs(el.currentTime - expected) > DRIFT_THRESHOLD_MS / 1000) {
        el.currentTime = expected;
      }
    }, DRIFT_CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [state]);

  const togglePlay = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (state?.is_playing) {
        await roomPlaybackApi.pause();
      } else if (state?.current_track_id) {
        await roomPlaybackApi.play();
      } else if (playlist.length > 0) {
        // No track selected yet — kick off the first playlist entry.
        await roomPlaybackApi.change(playlist[0].track_id);
      }
    } finally {
      setBusy(false);
    }
  }, [busy, state, playlist]);

  const handleChange = useCallback(
    async (trackId: string) => {
      if (busy || !trackId) return;
      setBusy(true);
      try {
        await roomPlaybackApi.change(trackId);
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  const handleSkip = useCallback(async () => {
    if (busy || playlist.length === 0) return;
    const idx = playlist.findIndex(
      (p) => p.track_id === state?.current_track_id,
    );
    const next = playlist[(idx + 1) % playlist.length];
    if (!next) return;
    await handleChange(next.track_id);
  }, [busy, playlist, state, handleChange]);

  const trackTitle = state?.track?.title ?? null;

  return (
    <div
      className="absolute z-10 flex items-center gap-2 px-3 py-2 rounded-md"
      style={{
        right: 24,
        top: 24,
        background: "rgba(8,3,25,0.85)",
        border: "1px solid var(--border2)",
        boxShadow: "0 0 14px rgba(167,139,250,0.18)",
        backdropFilter: "blur(6px)",
        maxWidth: 360,
      }}
    >
      {/* Visitor-readable status badge */}
      <span style={{ fontSize: 14 }} aria-hidden>
        🎵
      </span>
      <span
        className="font-japan"
        style={{
          fontSize: 12,
          color: trackTitle ? "var(--a2)" : "var(--muted)",
          maxWidth: 160,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {trackTitle ?? "尚未播放"}
      </span>

      {isOwner && (
        <>
          <button
            type="button"
            onClick={() => void togglePlay()}
            disabled={busy}
            aria-label={state?.is_playing ? "暫停" : "播放"}
            className="font-japan"
            style={{
              fontSize: 13,
              padding: "3px 8px",
              border: "1px solid var(--border)",
              background: "rgba(18,8,48,0.6)",
              borderRadius: 4,
              color: "var(--amber)",
              cursor: busy ? "wait" : "pointer",
            }}
          >
            {state?.is_playing ? "⏸" : "▶"}
          </button>
          <button
            type="button"
            onClick={() => void handleSkip()}
            disabled={busy || playlist.length === 0}
            aria-label="下一首"
            className="font-japan"
            style={{
              fontSize: 13,
              padding: "3px 8px",
              border: "1px solid var(--border)",
              background: "rgba(18,8,48,0.6)",
              borderRadius: 4,
              color: "var(--a2)",
              cursor:
                busy || playlist.length === 0 ? "not-allowed" : "pointer",
              opacity: playlist.length === 0 ? 0.5 : 1,
            }}
          >
            ⏭
          </button>
          {playlist.length > 0 && (
            <select
              value={state?.current_track_id ?? ""}
              onChange={(e) => void handleChange(e.target.value)}
              disabled={busy}
              className="font-japan"
              style={{
                fontSize: 11,
                padding: "3px 4px",
                background: "rgba(18,8,48,0.6)",
                color: "var(--muted)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                maxWidth: 120,
              }}
            >
              <option value="" disabled>
                換曲…
              </option>
              {playlist.map((p) => (
                <option key={p.track_id} value={p.track_id}>
                  {p.track.title}
                </option>
              ))}
            </select>
          )}
        </>
      )}

      <audio
        ref={audioRef}
        preload="none"
        // No `controls` — controls live in the owner buttons above; the
        // hidden element just plays/pauses based on bound state.
      />
    </div>
  );
}

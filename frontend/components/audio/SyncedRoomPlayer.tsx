"use client";

/**
 * Phase 9 — visitor-side mirror of a room owner's playback timeline.
 *
 * Reads from `useRoomPlaybackStore` (which subscribes to WS
 * `music.{play,pause,change}` on `room:{id}`) and drives its own
 * `<audio>` element. Deliberately decoupled from `audioStore` /
 * `GlobalAudioMount` — those serve the owner's personal radio with
 * shuffle/skip semantics; mixing in a forced-position visitor stream
 * would either break owner controls or fight the singleton mount.
 *
 * Owner-vs-visitor gating lives in the room page; this component
 * assumes it's only mounted for visitors.
 */

import { useEffect, useRef } from "react";

import { tracksApi } from "@/lib/api/endpoints";
import { useAudioStore } from "@/lib/state/audioStore";
import { useRoomPlaybackStore } from "@/lib/state/roomPlaybackStore";
import { useRealtime } from "@/lib/ws/useRealtime";

interface Props {
  roomId: string;
  label?: string;
}

export function SyncedRoomPlayer({ roomId, label = "房間音樂" }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackId = useRoomPlaybackStore((s) => s.trackId);
  const trackTitle = useRoomPlaybackStore((s) => s.trackTitle);
  const isPlaying = useRoomPlaybackStore((s) => s.isPlaying);
  const trackVersion = useRoomPlaybackStore((s) => s.trackVersion);
  const hydrate = useRoomPlaybackStore((s) => s.hydrate);
  const applyPlay = useRoomPlaybackStore((s) => s.applyPlay);
  const applyPause = useRoomPlaybackStore((s) => s.applyPause);
  const applyChange = useRoomPlaybackStore((s) => s.applyChange);
  const reset = useRoomPlaybackStore((s) => s.reset);

  const volume = useAudioStore((s) => s.volume);
  const audioUnlocked = useAudioStore((s) => s.audioUnlocked);
  const unlock = useAudioStore((s) => s.unlock);

  // (1) Mount: hydrate snapshot + subscribe to WS. Cleanup on unmount /
  //     roomId change pauses the element AND clears src so the browser
  //     drops the buffered network connection (otherwise audio can bleed
  //     into the next route).
  useEffect(() => {
    const el = audioRef.current;
    void hydrate(roomId);
    return () => {
      if (el) {
        el.pause();
        el.removeAttribute("src");
        el.load();
      }
      reset();
    };
  }, [roomId, hydrate, reset]);

  useRealtime((msg) => {
    // WsMessage's catch-all variant widens field accesses to `unknown`;
    // match the coercion pattern used by useRealtimeMatch to narrow.
    if (msg.type === "music.play" && msg.room_id === roomId) {
      applyPlay({
        track_id: msg.track_id == null ? null : String(msg.track_id),
        started_at_ms:
          msg.started_at_ms == null ? null : Number(msg.started_at_ms),
      });
    } else if (msg.type === "music.pause" && msg.room_id === roomId) {
      applyPause({ paused_at_ms: Number(msg.paused_at_ms) });
    } else if (msg.type === "music.change" && msg.room_id === roomId) {
      applyChange({
        track_id: String(msg.track_id),
        started_at_ms: Number(msg.started_at_ms),
      });
    }
  });

  // (2) Track IDENTITY changed → swap src + seek to expected offset.
  // Gating on `trackVersion` alone (bumped by the store only on real
  // track changes / initial hydrate) means pause/resume events don't
  // re-trigger a seek — that would stutter the audio buffer on every
  // owner pause. The position is read inline via getState() so the
  // effect deps stay minimal.
  // Backend invariant: on `music.play` (resume), `started_at_ms` is
  // adjusted to `now - paused_offset`, so `(now - started_at_ms)/1000`
  // always gives the right offset whether we're resuming or fresh.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const snap = useRoomPlaybackStore.getState();
    const tid = snap.trackId;
    if (!tid || tid.startsWith("local:")) {
      el.removeAttribute("src");
      el.load();
      return;
    }
    el.src = tracksApi.streamUrl(tid);
    el.load();
    if (snap.startedAtMs == null) {
      el.currentTime = 0;
    } else {
      const nowMs = snap.isPlaying ? Date.now() : snap.pausedAtMs ?? Date.now();
      el.currentTime = Math.max(0, (nowMs - snap.startedAtMs) / 1000);
    }
  }, [trackVersion]);

  // (3) Playback intent.
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !trackId) return;
    if (isPlaying && audioUnlocked) {
      el.play().catch(() => {
        /* autoplay policy / decode race — ignored, user can click unlock */
      });
    } else {
      el.pause();
    }
  }, [isPlaying, trackId, audioUnlocked]);

  // (4) Mirror user's mixer volume.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = volume;
  }, [volume]);

  const muted = !trackId;
  const showUnlock = !audioUnlocked && isPlaying && !!trackId;

  return (
    <div className="panel relative overflow-hidden flex flex-col gap-1 px-2.5 py-2 bg-card border border-border rounded">
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-muted">🎵 {label}</div>
        <EqBars playing={isPlaying && !!trackId} />
      </div>
      <div className="text-[10px] truncate" style={{ color: "var(--a2)" }}>
        {muted ? "房間靜默中" : trackTitle ?? "正在播放…"}
      </div>
      <div className="text-[9px] text-muted truncate">
        {muted ? "—" : "與房主同步"}
      </div>
      {showUnlock ? (
        <button
          type="button"
          onClick={unlock}
          className="text-[10px] mt-1 px-2 py-1 rounded border border-amber text-amber hover:bg-amber/10"
        >
          🔊 點擊聆聽
        </button>
      ) : null}
      <audio ref={audioRef} preload="metadata" />
    </div>
  );
}

function EqBars({ playing }: { playing: boolean }) {
  return (
    <div className="flex items-end gap-0.5 h-4">
      {Array.from({ length: 14 }).map((_, i) => {
        const h = 3 + ((i * 37) % 13);
        return (
          <span
            key={i}
            className="w-[3px] rounded-sm"
            style={{
              background: "linear-gradient(to top,var(--a3),var(--a2))",
              height: `${h}px`,
              opacity: playing ? 1 : 0.3,
            }}
          />
        );
      })}
    </div>
  );
}

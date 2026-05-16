"use client";

/**
 * Personal radio — per-user, server-randomized local playlist.
 *
 * Calls `GET /api/v1/playback/playlist?context=…` once, then plays
 * through the returned tracks locally via a hidden `<audio>` element.
 * There is **no** cross-user sync: two users in the same room
 * deliberately hear different songs in different orders. The component
 * is therefore SRP-pure — it knows nothing about WebSockets,
 * presence, or room ownership.
 *
 * Track URLs reuse the existing unauthenticated stream endpoint
 * (`tracksApi.streamUrl`); the playlist endpoint only returns ids +
 * metadata so the wire payload stays small.
 *
 * Autoplay: browsers block `play()` without a prior user gesture, so
 * the panel shows a "🔊 點擊聆聽" pill until the user clicks once
 * per session.
 */

import { clsx } from "clsx";
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

interface Props {
  context: PersonalPlaylistContext;
  contextId?: string | null;
  /** Visual label shown next to the EQ. Defaults derived from context. */
  label?: string;
  /** Class names for the outer panel, so callers can position it. */
  className?: string;
}

export function PersonalRadio({ context, contextId, label, className }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [tracks, setTracks] = useState<PersonalPlaylistTrack[]>([]);
  const [index, setIndex] = useState(0);
  // If the splash signin click already set the unlock flag we start
  // playing as soon as the playlist arrives — no second gesture required.
  const [audioUnlocked, setAudioUnlocked] = useState(isAudioUnlocked);
  const [isPlaying, setIsPlaying] = useState(() => isAudioUnlocked());
  const [volume, setVolume] = useState(0.65);

  // Fetch the personalized playlist once on mount / context change.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await personalRadioApi.getPlaylist({
          context,
          contextId: contextId ?? null,
        });
        if (!cancelled) {
          setTracks(res.tracks);
          setIndex(0);
        }
      } catch {
        if (!cancelled) {
          setTracks([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [context, contextId]);

  const currentTrack = tracks[index] ?? null;

  // Bind audio element to current track + play state. When the track
  // changes we let the element load fresh and (if unlocked) auto-play.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (!currentTrack) {
      el.pause();
      el.removeAttribute("src");
      return;
    }
    const desired = tracksApi.streamUrl(currentTrack.id);
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

  const advance = () => {
    if (tracks.length === 0) return;
    setIndex((i) => (i + 1) % tracks.length);
    setIsPlaying(true);
  };

  const previous = () => {
    if (tracks.length === 0) return;
    setIndex((i) => (i - 1 + tracks.length) % tracks.length);
    setIsPlaying(true);
  };

  const unlockAndPlay = () => {
    setAudioUnlocked(true);
    markAudioUnlocked();
    setIsPlaying(true);
  };

  const headerLabel = useMemo(
    () => label ?? (context === "city" ? "城市電台" : "個人電台"),
    [label, context],
  );

  return (
    <div
      className={clsx(
        "panel relative overflow-hidden flex flex-col gap-1 px-2.5 py-2 bg-card border border-border rounded",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-muted">🎵 {headerLabel}</div>
        <EqBars playing={isPlaying} />
      </div>

      <div className="text-[10px] truncate" style={{ color: "var(--a2)" }}>
        {currentTrack?.title ?? "—"}
      </div>
      <div className="text-[9px] text-muted truncate">
        {currentTrack?.artist ?? ""}
        {tracks.length > 0 ? ` · ${index + 1}/${tracks.length}` : ""}
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={previous}
          disabled={tracks.length === 0}
          aria-label="上一首"
          className={clsx(
            "w-[22px] h-[22px] border rounded-sm",
            tracks.length === 0
              ? "border-border text-muted opacity-40 cursor-not-allowed"
              : "border-border text-muted hover:border-accent-1 hover:text-accent-1",
          )}
        >
          ⏮
        </button>
        <button
          type="button"
          onClick={() => {
            if (!audioUnlocked) {
              unlockAndPlay();
              return;
            }
            setIsPlaying((p) => !p);
          }}
          disabled={tracks.length === 0}
          aria-label={isPlaying ? "暫停" : "播放"}
          className={clsx(
            "w-[22px] h-[22px] border rounded-sm",
            tracks.length === 0
              ? "border-border text-muted opacity-40 cursor-not-allowed"
              : "border-accent-1 text-accent-1",
          )}
        >
          {isPlaying ? "⏸" : "▶"}
        </button>
        <button
          type="button"
          onClick={advance}
          disabled={tracks.length === 0}
          aria-label="下一首"
          className={clsx(
            "w-[22px] h-[22px] border rounded-sm",
            tracks.length === 0
              ? "border-border text-muted opacity-40 cursor-not-allowed"
              : "border-border text-muted hover:border-accent-1 hover:text-accent-1",
          )}
        >
          ⏭
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          onChange={(e) => setVolume(Number(e.target.value) / 100)}
          aria-label="音量"
          className="flex-1"
        />
      </div>

      {!audioUnlocked && tracks.length > 0 ? (
        <button
          type="button"
          onClick={unlockAndPlay}
          className="text-[10px] mt-1 px-2 py-1 rounded border border-amber text-amber hover:bg-amber/10"
        >
          🔊 點擊聆聽
        </button>
      ) : null}

      <audio
        ref={audioRef}
        preload="none"
        onEnded={advance}
        style={{ display: "none" }}
        aria-hidden
      />
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

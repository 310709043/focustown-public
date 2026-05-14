"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { ApiError } from "@/lib/api/client";
import { tracksApi } from "@/lib/api/endpoints";
import type { Track } from "@/lib/api/types.gen";

const MOOD_TABS: { key: string; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "lofi", label: "lofi" },
  { key: "jazz", label: "jazz" },
  { key: "rain", label: "🌧rain" },
];

export function MusicPanel() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mood, setMood] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    const filter = mood === "all" ? undefined : mood;
    tracksApi
      .list(filter)
      .then((rows) => {
        if (cancelled) return;
        setTracks(rows);
        setIdx(0);
        setPlaying(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : "load_failed");
      });
    return () => {
      cancelled = true;
    };
  }, [mood]);

  const current: Track | null = tracks[idx] ?? null;

  const currentId = current?.id;
  useEffect(() => {
    // Whenever the current track changes, swap the audio src. If we were
    // playing, kick off playback again (browser may block autoplay; that's OK).
    const el = audioRef.current;
    if (!el || !currentId) return;
    if (playing) {
      el.play().catch(() => {
        /* autoplay blocked — leave paused, user can click ▶ */
      });
    } else {
      el.pause();
    }
  }, [currentId, playing]);

  function handleToggle() {
    if (!current) return;
    setPlaying((p) => !p);
  }

  function step(delta: number) {
    if (tracks.length === 0) return;
    setIdx((i) => (i + delta + tracks.length) % tracks.length);
  }

  return (
    <div className="panel relative overflow-hidden flex flex-col gap-1 px-2.5 py-2 bg-card border border-border rounded">
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-muted">🎵 音樂</div>
        <div className="flex items-end gap-0.5 h-4">
          {Array.from({ length: 14 }).map((_, i) => {
            const h = 3 + Math.random() * 13;
            return (
              <span
                key={i}
                className="w-[3px] rounded-sm bg-gradient-to-t"
                style={{
                  background: "linear-gradient(to top,var(--a3),var(--a2))",
                  height: `${h}px`,
                  opacity: playing ? 1 : 0.3,
                }}
              />
            );
          })}
        </div>
      </div>

      <div className="text-[10px] truncate" style={{ color: "var(--a2)" }}>
        {error
          ? "—"
          : current
            ? current.title + (current.artist ? ` — ${current.artist}` : "")
            : "（音樂庫是空的）"}
      </div>
      <div className="text-[9px] text-muted truncate">
        {tracks.length > 0
          ? `♪ ${idx + 1}/${tracks.length} · ${current?.mood ?? mood}`
          : (
              <Link href="/town/library" className="text-accent-1 hover:underline">
                前往音樂庫上傳第一首 →
              </Link>
            )}
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          className="w-[22px] h-[22px] border border-border rounded-sm text-muted hover:border-accent-1 hover:text-accent-1 disabled:opacity-40"
          onClick={() => step(-1)}
          disabled={tracks.length < 2}
        >
          ⏮
        </button>
        <button
          type="button"
          className="w-[22px] h-[22px] border border-accent-1 rounded-sm text-accent-1 disabled:opacity-40"
          onClick={handleToggle}
          disabled={!current}
        >
          {playing ? "⏸" : "▶"}
        </button>
        <button
          type="button"
          className="w-[22px] h-[22px] border border-border rounded-sm text-muted hover:border-accent-1 hover:text-accent-1 disabled:opacity-40"
          onClick={() => step(1)}
          disabled={tracks.length < 2}
        >
          ⏭
        </button>
        <input type="range" min="0" max="100" defaultValue="65" className="flex-1" />
      </div>

      <div className="flex gap-1 flex-wrap">
        {MOOD_TABS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMood(m.key)}
            className={clsx(
              "text-[9px] px-1.5 py-0.5 rounded-full border",
              mood === m.key
                ? "border-accent-1 text-accent-1"
                : "border-border text-muted",
            )}
          >
            {m.label}
          </button>
        ))}
        <span
          className="text-[9px] px-1.5 py-0.5 rounded-full border border-border text-muted opacity-50 cursor-not-allowed"
          title="Phase 6b 規劃中"
        >
          🎵 Spotify
        </span>
      </div>

      {current && (
        <audio
          ref={audioRef}
          src={tracksApi.streamUrl(current.id)}
          preload="none"
          onEnded={() => step(1)}
        />
      )}
    </div>
  );
}

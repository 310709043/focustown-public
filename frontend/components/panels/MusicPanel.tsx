"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { clsx } from "clsx";

import { Link } from "@/i18n/routing";
import { ApiError } from "@/lib/api/client";
import { roomTracksApi, tracksApi } from "@/lib/api/endpoints";
import { useAuthStore } from "@/lib/state/authStore";
import type { Track } from "@/lib/api/types.gen";

const MOOD_TABS: { key: string; labelKey: "allTab" | "lofiTab" | "jazzTab" | "rainTab" }[] = [
  { key: "all", labelKey: "allTab" },
  { key: "lofi", labelKey: "lofiTab" },
  { key: "jazz", labelKey: "jazzTab" },
  { key: "rain", labelKey: "rainTab" },
];

type Source = "room" | "library";

export function MusicPanel() {
  const { user } = useAuthStore();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [source, setSource] = useState<Source>("library");
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mood, setMood] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const t = useTranslations("library.music");

  useEffect(() => {
    let cancelled = false;
    setError(null);

    async function load() {
      // Prefer the authenticated user's room playlist when non-empty;
      // fall back to the global library (Phase 6) otherwise. The source
      // switch is silent (no UI toggle) — Phase 9 will add UI surface
      // for in-room playback controls.
      if (user) {
        try {
          const playlist = await roomTracksApi.list();
          if (cancelled) return;
          if (playlist.length > 0) {
            setTracks(playlist.map((p) => p.track));
            setSource("room");
            setIdx(0);
            setPlaying(false);
            return;
          }
        } catch {
          // fall through to global library
        }
      }
      const filter = mood === "all" ? undefined : mood;
      try {
        const rows = await tracksApi.list(filter);
        if (cancelled) return;
        setTracks(rows);
        setSource("library");
        setIdx(0);
        setPlaying(false);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : "load_failed");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [mood, user]);

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
    <div className="pixel-panel relative overflow-hidden flex flex-col gap-1 px-2.5 py-2">
      <div className="flex items-center justify-between">
        <div className="font-pixel-en text-[10px]" style={{ color: "var(--dir-ink-mute)", letterSpacing: 1 }}>
          {t("panelTitle")}{source === "room" ? t("sourceRoom") : t("sourceLofi")}
        </div>
        {/* Deterministic EQ silhouette (seeded by bar index) so SSR/CSR
            agree on bar heights and we don't trigger a hydration mismatch.
            The bars don't animate in this revision; that's intentional —
            a future tier can drive heights from <audio> analyser data. */}
        <div className="flex items-end gap-0.5 h-4">
          {Array.from({ length: 14 }).map((_, i) => {
            // Cheap deterministic 0..1 derived from index; same on server + client.
            const seed = ((i * 31 + 7) % 13) / 13;
            const h = 3 + seed * 13;
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
            : t("empty")}
      </div>
      <div className="text-[9px] text-muted truncate">
        {tracks.length > 0 ? (
          t("trackCount", {
            current: idx + 1,
            total: tracks.length,
            mood: current?.mood ?? mood,
          })
        ) : (
          <Link href="/town/library" className="text-accent-1 hover:underline">
            {t("uploadHint")}
          </Link>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="w-[22px] h-[22px] touch:w-9 touch:h-9 border border-border rounded-sm text-muted hover:border-accent-1 hover:text-accent-1 active:border-accent-1 active:text-accent-1 disabled:opacity-40"
          onClick={() => step(-1)}
          disabled={tracks.length < 2}
        >
          ⏮
        </button>
        <button
          type="button"
          className="w-[22px] h-[22px] touch:w-10 touch:h-10 border border-accent-1 rounded-sm text-accent-1 active:bg-accent-1/15 disabled:opacity-40"
          onClick={handleToggle}
          disabled={!current}
        >
          {playing ? "⏸" : "▶"}
        </button>
        <button
          type="button"
          className="w-[22px] h-[22px] touch:w-9 touch:h-9 border border-border rounded-sm text-muted hover:border-accent-1 hover:text-accent-1 active:border-accent-1 active:text-accent-1 disabled:opacity-40"
          onClick={() => step(1)}
          disabled={tracks.length < 2}
        >
          ⏭
        </button>
        <input type="range" min="0" max="100" defaultValue="65" className="flex-1" />
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {MOOD_TABS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMood(m.key)}
            className={clsx(
              "text-[9px] px-2 py-1 touch:py-1.5 touch:px-2.5 touch:min-h-[32px] md:px-1.5 md:py-0.5 rounded-full border",
              mood === m.key
                ? "border-accent-1 text-accent-1"
                : "border-border text-muted active:border-accent-1/60",
            )}
          >
            {t(m.labelKey)}
          </button>
        ))}
        <span
          className="text-[9px] px-2 py-1 touch:py-1.5 touch:px-2.5 md:px-1.5 md:py-0.5 rounded-full border border-border text-muted opacity-50 cursor-not-allowed"
          title={t("phaseNote")}
        >
          {t("spotifyTabLabel")}
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

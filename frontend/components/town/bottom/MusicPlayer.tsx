"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { PixelSprite } from "@/components/pixel/PixelSprite";
import { NOTE } from "@/lib/pixel/sprites/props";
import { useRadioPlaylist } from "@/lib/hooks/useRadioPlaylist";

import { EQViz } from "./EQViz";

type GenreKey = "lofi" | "classical" | "rain" | "cafe" | "forest";
const GENRES: ReadonlyArray<GenreKey> = ["lofi", "classical", "rain", "cafe", "forest"];

/**
 * Bottom-HUD right cluster — reference-aligned music UI for /town.
 *
 * Owns the city radio's `<audio>` element via the shared
 * `useRadioPlaylist` hook (also consumed by `<PersonalRadio>` on
 * /focus/[id] and /town/room/[id]). DIP: depends on the hook, not on
 * direct `personalRadioApi` / `<audio>` plumbing.
 *
 * Reference: screen-town.jsx:L1234-L1283.
 */
export function MusicPlayer() {
  const t = useTranslations("town.bottom.musicPlayer");
  const {
    tracks,
    index,
    currentTrack,
    isPlaying,
    audioUnlocked,
    audioRef,
    toggle,
    unlock,
    next,
    prev,
    onEnded,
  } = useRadioPlaylist({ context: "city", contextId: "city" });
  const [activeGenre, setActiveGenre] = useState<GenreKey>("lofi");
  const [pos, setPos] = useState(60);

  // Decorative progress bar — drifts visually while playing. The track
  // currentTime would be more accurate but reading it on every tick from
  // the audio element is wasteful for a sub-second-precision visual.
  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setInterval(() => setPos((p) => (p + 0.3) % 100), 300);
    return () => window.clearInterval(id);
  }, [isPlaying]);

  const total = (currentTrack?.duration_ms ?? 90_000) / 1000;
  const elapsed = (pos / 100) * total;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(Math.floor(elapsed) % 60).padStart(2, "0");

  return (
    <div
      data-testid="music-player"
      className="pixel-panel"
      style={{ padding: 12, display: "flex", flexDirection: "column", gap: 6 }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div
          className="font-silkscreen"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 10,
            color: "var(--accent-3)",
            letterSpacing: "0.2em",
          }}
        >
          <PixelSprite sprite={NOTE.sprite} palette={NOTE.palette} scale={1.4} />
          <span>{t("liveLabel")}</span>
        </div>
        <EQViz playing={isPlaying} />
      </div>

      <div className="font-silkscreen" style={{ fontSize: 12, color: "var(--ink)" }}>
        {currentTrack ? currentTrack.title : t("trackTitleFallback")}
      </div>
      <div
        className="font-silkscreen"
        style={{ fontSize: 9, color: "var(--ink-mute)", letterSpacing: "0.1em" }}
      >
        {t("trackSubLine", {
          index: tracks.length > 0 ? index + 1 : 1,
          total: tracks.length > 0 ? tracks.length : 5,
        })}
      </div>

      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
        <button
          type="button"
          aria-label={t("prevAria")}
          data-testid="music-prev"
          className="pixel-btn"
          style={{ padding: "4px 6px", fontSize: 10 }}
          onClick={prev}
        >
          ◀◀
        </button>
        <button
          type="button"
          aria-label={isPlaying ? t("pauseAria") : t("playAria")}
          data-testid="music-toggle"
          className="pixel-btn primary"
          style={{ padding: "4px 8px", fontSize: 10 }}
          onClick={toggle}
        >
          {isPlaying ? "⏸" : "▶"}
        </button>
        <button
          type="button"
          aria-label={t("nextAria")}
          data-testid="music-next"
          className="pixel-btn"
          style={{ padding: "4px 6px", fontSize: 10 }}
          onClick={next}
        >
          ▶▶
        </button>
        <div
          style={{
            flex: 1,
            height: 6,
            background: "rgba(0,0,0,0.5)",
            border: "1px solid var(--panel-stroke)",
            position: "relative",
          }}
        >
          <div
            style={{
              width: `${pos}%`,
              height: "100%",
              background: "var(--accent-3)",
              boxShadow: "var(--neon-glow-cyan)",
            }}
          />
        </div>
        <span
          className="font-silkscreen"
          style={{ fontSize: 9, color: "var(--ink-mute)" }}
        >
          {mm}:{ss}
        </span>
      </div>

      {!audioUnlocked && tracks.length > 0 ? (
        <button
          type="button"
          onClick={unlock}
          className="font-silkscreen"
          style={{
            alignSelf: "center",
            fontSize: 9,
            padding: "2px 8px",
            border: "1px solid var(--accent-4)",
            color: "var(--accent-4)",
            background: "transparent",
            cursor: "pointer",
            letterSpacing: "0.1em",
          }}
        >
          🔊 {t("unlockHint")}
        </button>
      ) : null}

      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        {GENRES.map((g) => {
          const active = activeGenre === g;
          return (
            <button
              key={g}
              type="button"
              onClick={() => setActiveGenre(g)}
              data-active={active || undefined}
              className="font-silkscreen"
              style={{
                fontSize: 8,
                padding: "1px 5px",
                border: `1px solid ${active ? "var(--accent-3)" : "var(--panel-stroke)"}`,
                color: active ? "var(--accent-3)" : "var(--ink-dim)",
                background: "transparent",
                cursor: "pointer",
                letterSpacing: "0.1em",
              }}
            >
              #{t(`genres.${g}` as const)}
            </button>
          );
        })}
      </div>

      <audio
        ref={audioRef}
        preload="none"
        onEnded={onEnded}
        style={{ display: "none" }}
        aria-hidden
      />
    </div>
  );
}

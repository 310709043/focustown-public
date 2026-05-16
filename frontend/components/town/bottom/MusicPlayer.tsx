"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { PixelSprite } from "@/components/pixel/PixelSprite";
import { NOTE } from "@/lib/pixel/sprites/props";
import { personalRadioApi, type PersonalPlaylistTrack } from "@/lib/api/endpoints";

import { EQViz } from "./EQViz";

type GenreKey = "lofi" | "classical" | "rain" | "cafe" | "forest";
const GENRES: ReadonlyArray<GenreKey> = ["lofi", "classical", "rain", "cafe", "forest"];

/**
 * Bottom-HUD right cluster — visual music UI. UI-only this PR per the
 * Phase C1 plan's risk mitigation: fetches the personal radio playlist
 * for the current track display, but DOES NOT mount an `<audio>` element
 * (audio playback follow-up will extract a `useCityRadio()` hook shared
 * with `<PersonalRadio>` so the two can drive a single audio source).
 *
 * SRP — visual + playlist display, nothing else.
 * DIP — `personalRadioApi.getPlaylist` (existing endpoint wrapper).
 */
export function MusicPlayer() {
  const t = useTranslations("town.bottom.musicPlayer");
  const [tracks, setTracks] = useState<PersonalPlaylistTrack[]>([]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(60);
  const [activeGenre, setActiveGenre] = useState<GenreKey>("lofi");

  useEffect(() => {
    let cancelled = false;
    personalRadioApi
      .getPlaylist({ context: "city", contextId: "city" })
      .then((res) => {
        if (!cancelled) setTracks(res.tracks);
      })
      .catch(() => {
        /* tolerate transient failures — display falls back to seed copy */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Decorative progress animation; not synced to real audio yet.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setPos((p) => (p + 0.3) % 100), 300);
    return () => window.clearInterval(id);
  }, [playing]);

  const current = tracks[idx] ?? null;
  const totalSeconds = (current?.duration_ms ?? 90_000) / 1000;
  const elapsed = (pos / 100) * totalSeconds;
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
        <EQViz playing={playing} />
      </div>

      <div
        className="font-silkscreen"
        style={{ fontSize: 12, color: "var(--ink)" }}
      >
        {current ? current.title : t("trackTitleFallback")}
      </div>
      <div
        className="font-silkscreen"
        style={{ fontSize: 9, color: "var(--ink-mute)", letterSpacing: "0.1em" }}
      >
        {t("trackSubLine", {
          index: tracks.length > 0 ? idx + 1 : 1,
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
          onClick={() =>
            setIdx((i) => (tracks.length > 0 ? (i - 1 + tracks.length) % tracks.length : 0))
          }
        >
          ◀◀
        </button>
        <button
          type="button"
          aria-label={playing ? t("pauseAria") : t("playAria")}
          data-testid="music-toggle"
          className="pixel-btn primary"
          style={{ padding: "4px 8px", fontSize: 10 }}
          onClick={() => setPlaying((p) => !p)}
        >
          {playing ? "⏸" : "▶"}
        </button>
        <button
          type="button"
          aria-label={t("nextAria")}
          data-testid="music-next"
          className="pixel-btn"
          style={{ padding: "4px 6px", fontSize: 10 }}
          onClick={() => setIdx((i) => (tracks.length > 0 ? (i + 1) % tracks.length : 0))}
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
    </div>
  );
}

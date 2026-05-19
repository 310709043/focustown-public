"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

const TRACKS = [
  { id: "music", color: "var(--accent-2)" },
  { id: "rain", color: "var(--accent-3)" },
  { id: "cafe", color: "var(--accent-4)" },
  { id: "fire", color: "var(--accent)" },
] as const;

type TrackId = (typeof TRACKS)[number]["id"];

/**
 * Reference's 4-track ambient mixer. Sliders are decorative for now;
 * future work wires them to `useAudioStore` per-track volume. Each track
 * has a unique accent color matching the reference palette.
 */
export function SoundMixer() {
  const t = useTranslations("focus.solo.soundMixer");
  const [vol, setVol] = useState<Record<TrackId, number>>({
    music: 40,
    rain: 60,
    cafe: 30,
    fire: 0,
  });

  return (
    <div
      data-testid="sound-mixer"
      className="pixel-panel"
      style={{
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        className="font-silkscreen"
        style={{
          fontSize: 10,
          color: "var(--accent-3)",
          letterSpacing: "0.2em",
        }}
      >
        ● {t("header")}
      </div>
      {TRACKS.map((tr) => (
        <div
          key={tr.id}
          data-testid={`sound-track-${tr.id}`}
          style={{ display: "flex", alignItems: "center", gap: 8 }}
        >
          <span
            className="font-silkscreen"
            style={{
              fontSize: 10,
              color: "var(--ink)",
              width: 64,
            }}
          >
            {t(`tracks.${tr.id}`)}
          </span>
          <input
            data-testid={`sound-slider-${tr.id}`}
            type="range"
            min={0}
            max={100}
            value={vol[tr.id]}
            onChange={(e) =>
              setVol((v) => ({ ...v, [tr.id]: Number(e.target.value) }))
            }
            aria-label={t(`tracks.${tr.id}`)}
            style={{
              flex: 1,
              accentColor: tr.color,
              height: 4,
            }}
          />
          <span
            className="font-silkscreen"
            style={{
              fontSize: 9,
              color: tr.color,
              width: 22,
              textAlign: "right",
            }}
          >
            {vol[tr.id]}
          </span>
        </div>
      ))}
    </div>
  );
}

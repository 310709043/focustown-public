"use client";

import { useTranslations } from "next-intl";

export interface MixerVolumes {
  music: number;
  rain: number;
  cafe: number;
  fire: number;
}

interface SoundMixerProps {
  volumes: MixerVolumes;
  onChange: (next: MixerVolumes) => void;
}

const TRACKS: ReadonlyArray<{ id: keyof MixerVolumes; color: string }> = [
  { id: "music", color: "var(--accent-2)" },
  { id: "rain", color: "var(--accent-3)" },
  { id: "cafe", color: "var(--accent-4)" },
  { id: "fire", color: "var(--accent)" },
];

/**
 * Four-track ambient sound mixer. Local-state-only this PR — the
 * `PersonalRadio` and real audio fan-out wire up in a follow-up so the
 * sliders just persist the picked levels in the parent scene.
 */
export function SoundMixer({ volumes, onChange }: SoundMixerProps) {
  const t = useTranslations("focus.solo.soundMixer");
  return (
    <div
      data-testid="sound-mixer"
      className="pixel-panel"
      style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}
    >
      <span
        className="font-silkscreen"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontSize: 10,
          color: "var(--accent-3)",
          letterSpacing: "0.2em",
        }}
      >
        <span
          aria-hidden
          className="animate-blinkSoft"
          style={{
            width: 6,
            height: 6,
            background: "var(--accent-3)",
            boxShadow: "var(--neon-glow-cyan)",
          }}
        />
        {t("header")}
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {TRACKS.map((track) => {
          const value = volumes[track.id];
          return (
            <div key={track.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                className="font-silkscreen"
                style={{
                  fontSize: 10,
                  color: "var(--ink)",
                  letterSpacing: "0.05em",
                  width: 64,
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                }}
              >
                {t(`tracks.${track.id}` as "tracks.music")}
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={value}
                data-testid={`mixer-${track.id}`}
                onChange={(e) =>
                  onChange({ ...volumes, [track.id]: Number(e.target.value) })
                }
                style={{
                  flex: 1,
                  accentColor: track.color,
                  height: 4,
                }}
              />
              <span
                className="font-silkscreen"
                style={{
                  fontSize: 9,
                  color: track.color,
                  width: 22,
                  textAlign: "right",
                  flexShrink: 0,
                }}
              >
                {value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

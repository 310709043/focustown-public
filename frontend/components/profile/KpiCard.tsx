"use client";

import { type CSSProperties, type ReactNode } from "react";

import { PixelSprite } from "@/components/pixel/PixelSprite";
import { BATTERY, TROPHY } from "@/lib/pixel/sprites/props";
import type { Palette } from "@/lib/pixel/sprite";

export type KpiAccent = "battery" | "focus" | "streak" | "rank";

interface KpiCardProps {
  accent: KpiAccent;
  value: string;
  label: string;
  ariaLabel?: string;
  style?: CSSProperties;
}

interface AccentSpec {
  border: string;
  glow: string;
  valueColor: string;
  iconNode: ReactNode;
}

/* Inline flame sprite — 8 cols × 11 rows, two-tone amber→pink so the
   card reads as a stylized streak ember. Kept local to avoid bloating
   the shared sprite library before other surfaces ask for it. */
const FLAME_SPRITE = `
...AA...
..AAAA..
.AAAAAA.
.APAAAA.
APPPAAAA
APPPAAAA
APPPAAAA
.APPAAA.
.APPAA..
..PPA...
...P....
`;
const FLAME_PALETTE: Palette = { A: "#22d3ee", P: "#f472b6" };

/* Inline clock sprite — 10 cols × 10 rows, pink ring with cyan hands
   so the "累計專注" card mirrors the reference's pink-magenta accent. */
const CLOCK_SPRITE = `
..PPPP....
.P....P...
P..C..PP..
P..C..P.A.
P..CCCPAA.
P.....PA..
P.....P...
.P....P...
..PPPP....
..........
`;
const CLOCK_PALETTE: Palette = { P: "#f472b6", C: "#22d3ee", A: "#a78bfa" };

const ACCENTS: Record<KpiAccent, AccentSpec> = {
  battery: {
    border: "#fb7185",
    glow: "0 0 16px rgba(251,113,133,0.45)",
    valueColor: "#fcd34d",
    iconNode: <PixelSprite sprite={BATTERY.sprite} palette={BATTERY.palette} scale={2.4} />,
  },
  focus: {
    border: "#f472b6",
    glow: "0 0 16px rgba(244,114,182,0.45)",
    valueColor: "#f472b6",
    iconNode: <PixelSprite sprite={CLOCK_SPRITE} palette={CLOCK_PALETTE} scale={2.4} />,
  },
  streak: {
    border: "#22d3ee",
    glow: "0 0 16px rgba(34,211,238,0.45)",
    valueColor: "#22d3ee",
    iconNode: <PixelSprite sprite={FLAME_SPRITE} palette={FLAME_PALETTE} scale={2.4} />,
  },
  rank: {
    border: "#fcd34d",
    glow: "0 0 16px rgba(252,211,77,0.45)",
    valueColor: "#fcd34d",
    iconNode: <PixelSprite sprite={TROPHY.sprite} palette={TROPHY.palette} scale={2.4} />,
  },
};

export function KpiCard({ accent, value, label, ariaLabel, style }: KpiCardProps) {
  const spec = ACCENTS[accent];
  return (
    <div
      role="group"
      aria-label={ariaLabel ?? `${label} ${value}`}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 6,
        padding: "14px 12px 12px",
        minHeight: 132,
        background: "rgba(7,4,26,0.78)",
        border: `1px solid ${spec.border}`,
        boxShadow: `${spec.glow}, inset 0 0 0 1px rgba(7,4,26,0.55)`,
        ...style,
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 10,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          height: 36,
        }}
      >
        {spec.iconNode}
      </div>
      <span
        className="font-pixel"
        style={{
          marginTop: 38,
          fontSize: 22,
          letterSpacing: "0.06em",
          color: spec.valueColor,
          textShadow: `0 0 10px ${spec.border}`,
        }}
      >
        {value}
      </span>
      <span
        className="font-silkscreen"
        style={{
          fontSize: 10,
          letterSpacing: "0.28em",
          color: "var(--ink-mute)",
        }}
      >
        {label}
      </span>
    </div>
  );
}

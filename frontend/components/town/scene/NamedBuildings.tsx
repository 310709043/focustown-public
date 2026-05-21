"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { PixelSprite } from "@/components/pixel/PixelSprite";
import { hashUserId } from "@/lib/data/hash";
import { BUILDINGS } from "@/lib/pixel/sprites/buildings";
import { useSceneStore, type SceneName } from "@/lib/state/sceneStore";

import { BuildingTag } from "./BuildingTag";

/** Rooftop sign plaques. Each storefront declares a short label, a
 *  corner anchor (top-left / top-right / top-center) and a day/night
 *  visibility window. Day shows the calmer set (COFFEE / OPEN / BOOKS);
 *  night swaps BOOKS out for the nightlife trio (24H / LIVE) so the
 *  active set differs across scenes and the skyline reads as alive. */
type SignCorner = "tl" | "tr" | "tc";
type SignVisibility = "day" | "night" | "always";

const SIGNS: Record<string, { label: string; corner: SignCorner; visibility: SignVisibility }> = {
  cafe: { label: "COFFEE", corner: "tr", visibility: "always" },
  lofi: { label: "24H", corner: "tl", visibility: "night" },
  arcade: { label: "LIVE", corner: "tc", visibility: "night" },
  ramen: { label: "OPEN", corner: "tr", visibility: "always" },
  library: { label: "BOOKS", corner: "tl", visibility: "day" },
};

/** mulberry32 — small fast deterministic PRNG. Same input seed always
 *  produces the same stream, so SSR/CSR agree without `useState`. */
function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WINDOW_OPACITIES = [0.35, 0.6, 0.85, 1.0] as const;

/** Weather-driven multiply tint applied to all buildings. Maps scenes
 *  to a sub-set of reference's 5 weather states. */
const WEATHER_TINT: Record<SceneName, string> = {
  night: "transparent",
  midnight: "transparent",
  dawn: "transparent",
  day: "transparent",
  dusk: "transparent",
  cloudy: "rgba(110,110,140,0.18)",
  rain: "rgba(34,80,180,0.28)",
  snow: "rgba(220,230,250,0.18)",
  storm: "rgba(20,30,80,0.4)",
};

/** Subtle time-of-day overlay applied via `mix-blend: overlay`. */
const TIME_TINT: Record<SceneName, string> = {
  night: "rgba(20,8,58,0.2)",
  midnight: "rgba(2,2,10,0.35)",
  dawn: "rgba(217,122,138,0.12)",
  day: "rgba(255,255,255,0.04)",
  dusk: "rgba(240,130,90,0.12)",
  cloudy: "rgba(80,80,110,0.15)",
  rain: "rgba(20,30,80,0.2)",
  snow: "rgba(120,140,170,0.15)",
  storm: "rgba(2,2,10,0.35)",
};

const NIGHTY: readonly SceneName[] = ["night", "midnight", "storm"];

interface NamedBuildingsProps {
  /** When false, the floating `BuildingTag` labels are skipped — useful
   *  on /town where QA preferred a clean cityscape silhouette without
   *  the accent-colored name pills competing with the NPC tags below. */
  showLabels?: boolean;
}

/**
 * Foreground cityscape — 9 named pixel buildings (CAFE PIXEL →
 * INK STORE), each with optional floating `BuildingTag`, weather +
 * time-of-day tint overlays, and a radial halo at night. Replaces the
 * geometric `Buildings.tsx` for the duration of this visual port; the
 * old component remains importable for any pages that still depend on
 * it.
 */
export function NamedBuildings({ showLabels = true }: NamedBuildingsProps = {}) {
  const scene = useSceneStore((s) => s.current);
  const t = useTranslations("town");
  const weatherTint = WEATHER_TINT[scene];
  const timeTint = TIME_TINT[scene];
  const isNight = NIGHTY.includes(scene);

  return (
    <div
      data-testid="named-buildings"
      className="absolute left-0 right-0 pointer-events-none"
      style={{ bottom: 288, height: 420, zIndex: 3 }}
    >
      <div
        className="absolute left-0 right-0 bottom-0 flex items-end justify-between"
        style={{ padding: "0 26px" }}
      >
        {BUILDINGS.map((b, i) => (
          <div
            key={b.key}
            data-building={b.key}
            className="relative flex flex-col items-center"
            style={{ gap: 4 }}
          >
            {showLabels ? <BuildingTag label={t(b.labelKey)} idx={i} /> : null}
            <div style={{ position: "relative" }}>
              <PixelSprite
                sprite={b.sprite}
                palette={b.palette}
                scale={b.scale}
              />
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  inset: 0,
                  background: weatherTint,
                  mixBlendMode: "multiply",
                  pointerEvents: "none",
                }}
              />
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  inset: 0,
                  background: timeTint,
                  mixBlendMode: "overlay",
                  pointerEvents: "none",
                }}
              />
              {isNight ? (
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    inset: -8,
                    background: `radial-gradient(ellipse at center, ${b.glowColor}33 0%, transparent 60%)`,
                    pointerEvents: "none",
                    zIndex: -1,
                  }}
                />
              ) : null}
              {isNight ? (
                <BuildingWindowGlow buildingKey={b.key} color={b.glowColor} />
              ) : null}
              {(() => {
                const slot = SIGNS[b.key];
                if (!slot) return null;
                const visible =
                  slot.visibility === "always" ||
                  (slot.visibility === "night" && isNight) ||
                  (slot.visibility === "day" && !isNight);
                if (!visible) return null;
                return (
                  <BuildingSign
                    label={slot.label}
                    corner={slot.corner}
                    isNight={isNight}
                  />
                );
              })()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Lit-window overlay — 8–14 deterministic dots distributed across the
 * upper 25–80 % of the building bounding box, each with one of four
 * brightness levels and ~20 % chance of a slow `windowBlink` animation.
 * Seeded by building key so SSR/CSR agree and the pattern is "this
 * building always lights up the same way" rather than reshuffling on
 * every render.
 */
function BuildingWindowGlow({
  buildingKey,
  color,
}: {
  buildingKey: string;
  color: string;
}) {
  const dots = useMemo(() => {
    const rng = mulberry32(hashUserId(buildingKey) + 1);
    const count = 8 + Math.floor(rng() * 7); // 8..14
    return Array.from({ length: count }, (_, i) => ({
      key: i,
      // Horizontal: keep windows away from sprite edges
      leftPct: 10 + rng() * 78,
      // Vertical: upper 25..80 % so we avoid label + entrance areas
      topPct: 25 + rng() * 55,
      opacity:
        WINDOW_OPACITIES[Math.floor(rng() * WINDOW_OPACITIES.length)],
      blink: rng() < 0.2,
      blinkDur: 3 + rng() * 4, // 3..7s
      blinkDelay: rng() * 5, // 0..5s
    }));
  }, [buildingKey]);

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
      }}
    >
      {dots.map((d) => (
        <span
          key={d.key}
          className={d.blink ? "animate-windowBlink" : undefined}
          style={
            {
              position: "absolute",
              left: `${d.leftPct}%`,
              top: `${d.topPct}%`,
              width: 4,
              height: 4,
              background: color,
              opacity: d.opacity,
              boxShadow: `0 0 6px ${color}, 0 0 12px ${color}aa`,
              ["--wb-dur" as string]: `${d.blinkDur}s`,
              ["--wb-delay" as string]: `${d.blinkDelay}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** Rooftop sign plaque — flat cream-on-indigo label, no glow, no
 *  flicker. The frame brightens slightly at night to read against the
 *  darker sky; day and night share the same simple silhouette. */
function BuildingSign({
  label,
  corner,
  isNight,
}: {
  label: string;
  corner: SignCorner;
  isNight: boolean;
}) {
  const cornerStyle: React.CSSProperties =
    corner === "tl"
      ? { top: 4, left: -6 }
      : corner === "tr"
        ? { top: 4, right: -6 }
        : { top: 4, left: "50%", transform: "translateX(-50%)" };

  return (
    <span
      aria-hidden
      className="font-silkscreen"
      style={{
        position: "absolute",
        ...cornerStyle,
        padding: "1px 5px",
        fontSize: 9,
        letterSpacing: "0.12em",
        color: "#f4ecd8",
        background: "rgba(15,20,38,0.85)",
        border: `1px solid rgba(244,236,216,${isNight ? 0.7 : 0.4})`,
        pointerEvents: "none",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

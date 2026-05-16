"use client";

import { useTranslations } from "next-intl";

import { PixelSprite } from "@/components/pixel/PixelSprite";
import { BUILDINGS } from "@/lib/pixel/sprites/buildings";
import { useSceneStore, type SceneName } from "@/lib/state/sceneStore";

import { BuildingTag } from "./BuildingTag";

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

/**
 * Foreground cityscape — 9 named pixel buildings (CAFE PIXEL →
 * INK STORE), each with a floating `BuildingTag`, weather + time-of-day
 * tint overlays, and a radial halo at night. Replaces the geometric
 * `Buildings.tsx` for the duration of this visual port; the old
 * component remains importable for any pages that still depend on it.
 */
export function NamedBuildings() {
  const scene = useSceneStore((s) => s.current);
  const t = useTranslations("town");
  const weatherTint = WEATHER_TINT[scene];
  const timeTint = TIME_TINT[scene];
  const isNight = NIGHTY.includes(scene);

  return (
    <div
      data-testid="named-buildings"
      className="absolute left-0 right-0 pointer-events-none"
      style={{ bottom: 215, height: 420, zIndex: 3 }}
    >
      <div
        className="absolute left-0 right-0 bottom-0 flex items-end justify-between"
        style={{ padding: "0 26px" }}
      >
        {BUILDINGS.map((b, i) => (
          <div
            key={b.key}
            className="relative flex flex-col items-center"
            style={{ gap: 4 }}
          >
            <BuildingTag label={t(b.labelKey)} idx={i} />
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
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

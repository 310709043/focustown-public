"use client";

import { PixelSprite } from "@/components/pixel/PixelSprite";
import { MOON, SUN } from "@/lib/pixel/sprites/props";
import { useSceneStore } from "@/lib/state/sceneStore";
import { SCENES } from "@/lib/data/scenes";

const NIGHT_SCENES = new Set(["night", "midnight", "storm"]);
const DAY_SCENES = new Set(["day", "dawn", "dusk", "cloudy"]);

/**
 * Pixel moon / sun in the upper-right of the sky — replaces the
 * gradient circle in `Moon.tsx`. Switches sprite based on whether the
 * current scene reads as night or day, and inherits its opacity from
 * `SCENES[].moon` / `SCENES[].sun` so existing scene definitions still
 * drive how strongly the celestial body shows.
 */
export function CelestialBody() {
  const current = useSceneStore((s) => s.current);
  const scene = SCENES[current];

  const isNight = NIGHT_SCENES.has(current);
  const showSun = DAY_SCENES.has(current) && scene.sun > 0;
  const showMoon = isNight && scene.moon > 0;

  if (!showSun && !showMoon) return null;

  return (
    <div
      data-testid="celestial-body"
      aria-hidden
      className="animate-floatMoon"
      style={{
        position: "absolute",
        top: "8%",
        right: "6%",
        opacity: showMoon ? scene.moon * 0.95 : scene.sun * 0.95,
        zIndex: 1,
      }}
    >
      <PixelSprite
        sprite={showMoon ? MOON.sprite : SUN.sprite}
        palette={showMoon ? MOON.palette : SUN.palette}
        scale={6}
        glow={
          showMoon
            ? "rgba(252,211,77,0.4)"
            : "rgba(252,211,77,0.9)"
        }
      />
    </div>
  );
}

"use client";

import { useSceneStore } from "@/lib/state/sceneStore";
import type { SceneName } from "@/lib/state/sceneStore";

/**
 * City skyline background — 832833 city 1 parallax stack, 5 layers each
 * for Day and Night. Renders behind the named-building silhouettes so the
 * canonical landmarks (CAFE PIXEL, NEON TOWER, …) still sit in front.
 *
 * The scene → mode map collapses 9 SCENES into a binary {Day, Night} per
 * the canonical-reference-index.md § 1.1. A daytime cloud/rain band keeps
 * the Day skyline; nighttime weather (rain at night, snow, storm) uses
 * the Night plate; strict dawn/dusk also borrow the Day plate since their
 * own sky gradient (from scenes.ts) tints the silhouettes accordingly.
 *
 * Each layer is a full-bleed `<img>` from `/assets/v6/city/{Day,Night}/<N>.png`
 * (576×324, mode P, indexed colour). object-fit: cover scales it to the
 * viewport while preserving pixel-art crispness via image-rendering.
 *
 * No parallax animation yet — Town is a stationary scene. The Cycle /
 * Clouds-scroll scenes (Phase 1.E + Phase 3 polish) introduce horizontal
 * drift, at which point CityBackground may gain a parallax_x prop.
 */

const MODE_BY_SCENE: Record<SceneName, "Day" | "Night"> = {
  night: "Night",
  midnight: "Night",
  dawn: "Day",
  day: "Day",
  dusk: "Day",
  cloudy: "Day",
  rain: "Night",
  snow: "Night",
  storm: "Night",
};

const LAYERS = [1, 2, 3] as const;

export function CityBackground() {
  const scene = useSceneStore((s) => s.current);
  const mode = MODE_BY_SCENE[scene];
  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden>
      {LAYERS.map((layer) => (
        // Plain <img>: next/image runs source through optimization that
        // re-encodes pixel-art and breaks `image-rendering: pixelated`.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${mode}-${layer}`}
          src={`/assets/v6/city/${mode}/${layer}.png`}
          alt=""
          width={576}
          height={324}
          className="absolute inset-0 w-full h-full"
          style={{
            objectFit: "cover",
            imageRendering: "pixelated",
          }}
          loading="eager"
          decoding="async"
        />
      ))}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

import { PixelSprite } from "@/components/pixel/PixelSprite";
import { useSceneStore } from "@/lib/state/sceneStore";

/**
 * Soft drifting cloud overlay. Renders in every scene to match the
 * reference/follow.mp4 visual where cloud puffs are visible across the
 * full day → dusk → night → dawn cycle (only their palette + opacity
 * shift). The earlier gate that limited rendering to the `"cloudy"`
 * scene came from `reference/screen-town.jsx:94`, but follow.mp4 shows
 * clouds in every frame and is the newer source of truth.
 *
 * Five clouds at randomized scales + y-positions, drifting left-to-right
 * with per-cloud velocity. Pure scenery — no interaction, no presence
 * data. Pointer-events disabled so the layer doesn't intercept clicks
 * on buildings / NPCs underneath.
 */

const CLOUD_SPRITE = `
....CCCCCCC....
..CCCCCCCCCCC..
.CCCCCCCCCCCCC.
.CCCCCCCCCCCCC.
..CCCCCCCCCCC..
`;

type Cloud = {
  readonly id: number;
  readonly y: number; // top px
  readonly scale: number;
  readonly speed: number; // px/frame
  startX: number;
};

// Deterministic spread — avoids hydration mismatches between SSR + CSR.
// Values are slight variations on the reference's randomized seed band.
// Cloud row sized to the follow.mp4 reference: scales bumped from
// 2–4 → 4–6 so each puff reads at ~60–90 px wide (the inline sprite is
// 15 cells × scale). Y values widened to span the upper third of the
// viewport so the sky doesn't end up empty between modal and skyline.
const CLOUDS: readonly Omit<Cloud, "startX">[] = [
  { id: 0, y: 40,  scale: 5, speed: 0.18 },
  { id: 1, y: 110, scale: 4, speed: 0.24 },
  { id: 2, y: 170, scale: 6, speed: 0.16 },
  { id: 3, y: 75,  scale: 4, speed: 0.30 },
  { id: 4, y: 200, scale: 5, speed: 0.20 },
];

// 5 cloud start positions spread across the viewport.
const START_XS: readonly number[] = [-50, 220, 470, 720, 950];

// Per-scene cloud palette + overall layer opacity. Day → bright white,
// dusk/dawn → warm pink/peach to match the sunset gradient, night /
// midnight / storm → dim slate-blue. Cloudy keeps the heavier overcast
// look the original gate produced. Values picked to track the cloud
// colors visible across follow.mp4 frames 00 (day) → 12 (dusk) → 16
// (night) → 24 (dawn).
const CLOUD_PALETTES: Record<string, { fill: string; opacity: number }> = {
  day: { fill: "rgba(255,255,255,0.85)", opacity: 0.7 },
  dawn: { fill: "rgba(255,222,210,0.75)", opacity: 0.65 },
  dusk: { fill: "rgba(255,196,168,0.75)", opacity: 0.65 },
  cloudy: { fill: "rgba(245,243,255,0.7)", opacity: 0.55 },
  night: { fill: "rgba(140,150,180,0.45)", opacity: 0.5 },
  midnight: { fill: "rgba(110,118,150,0.4)", opacity: 0.45 },
  rain: { fill: "rgba(170,180,200,0.55)", opacity: 0.55 },
  snow: { fill: "rgba(230,240,255,0.7)", opacity: 0.6 },
  storm: { fill: "rgba(90,100,130,0.55)", opacity: 0.5 },
};

export function Clouds() {
  const scene = useSceneStore((s) => s.current);
  const [pos, setPos] = useState<number[]>(() => [...START_XS]);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    setWidth(window.innerWidth);
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (width === 0) return;
    let raf = 0;
    const tick = () => {
      setPos((ps) =>
        ps.map((p, i) => {
          const np = p + CLOUDS[i].speed;
          return np > width + 100 ? -150 : np;
        }),
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [width]);

  const palette = CLOUD_PALETTES[scene] ?? CLOUD_PALETTES.day;

  return (
    <div
      data-testid="clouds-overlay"
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 2,
        opacity: palette.opacity,
      }}
    >
      {CLOUDS.map((c, i) => (
        <div
          key={c.id}
          style={{
            position: "absolute",
            left: pos[i],
            top: c.y,
          }}
        >
          <PixelSprite
            sprite={CLOUD_SPRITE}
            palette={{ C: palette.fill }}
            scale={c.scale}
          />
        </div>
      ))}
    </div>
  );
}

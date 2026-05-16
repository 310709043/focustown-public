"use client";

import { useEffect, useState } from "react";

import { PixelSprite } from "@/components/pixel/PixelSprite";
import { useSceneStore } from "@/lib/state/sceneStore";

/**
 * Soft drifting cloud overlay. Renders only when the active scene is
 * `"cloudy"` — matches reference's `{weather === 'cloudy' && <Clouds />}`
 * gate at `reference/screen-town.jsx:94`.
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
const CLOUDS: readonly Omit<Cloud, "startX">[] = [
  { id: 0, y: 48,  scale: 3, speed: 0.18 },
  { id: 1, y: 92,  scale: 2, speed: 0.24 },
  { id: 2, y: 140, scale: 4, speed: 0.16 },
  { id: 3, y: 70,  scale: 2, speed: 0.30 },
  { id: 4, y: 180, scale: 3, speed: 0.20 },
];

// 5 cloud start positions spread across the viewport.
const START_XS: readonly number[] = [-50, 80, 250, 480, 720];

export function Clouds() {
  const scene = useSceneStore((s) => s.current);
  const [pos, setPos] = useState<number[]>(() => [...START_XS]);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (scene !== "cloudy") return;
    setWidth(window.innerWidth);
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [scene]);

  useEffect(() => {
    if (scene !== "cloudy" || width === 0) return;
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
  }, [scene, width]);

  if (scene !== "cloudy") return null;

  return (
    <div
      data-testid="clouds-overlay"
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 2,
        opacity: 0.55,
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
            palette={{ C: "rgba(245,243,255,0.7)" }}
            scale={c.scale}
          />
        </div>
      ))}
    </div>
  );
}

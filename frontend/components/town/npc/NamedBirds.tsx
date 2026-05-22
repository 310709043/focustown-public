"use client";

import { useEffect, useState } from "react";

import { PngAnimatedSprite } from "@/components/pixel/PngAnimatedSprite";
import { PNG_BIRDS } from "@/lib/pixel/sprites/birdsPng";

/**
 * Decorative ground-walking bird — silent scenery without a head label.
 * One rooster gives the city a low-frequency animal pulse without
 * imitating a player. See plan 1-city-2-ancient-hippo.md.
 */

type BirdNPC = {
  readonly key: "echo";
  readonly species: "chick" | "rooster";
  readonly bottom: number; // bottom px from viewport floor
  readonly speed: number; // %/frame drift
  readonly startX: number;
  readonly dir: 1 | -1;
};

const NPCS: readonly BirdNPC[] = [
  { key: "echo", species: "rooster", bottom: 32, speed: 0.04, startX: 48, dir: -1 },
];

const RENDER_SCALE: Record<"chick" | "rooster", number> = {
  chick: 2.0,   // 16x16 → 32x32 — readable but not dominating
  rooster: 1.5, // 32x32 → 48x48 — slightly larger than the chicks
};

export function NamedBirds() {
  const [pos, setPos] = useState<number[]>(() => NPCS.map((n) => n.startX));

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setPos((ps) =>
        ps.map((p, i) => {
          let np = p + NPCS[i].speed * NPCS[i].dir;
          if (np > 105) np = -4;
          if (np < -6) np = 105;
          return np;
        }),
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      {NPCS.map((n, i) => {
        const sheet = PNG_BIRDS[n.species];
        return (
          <div
            key={n.key}
            data-testid="named-bird"
            style={{
              position: "absolute",
              left: `${pos[i]}%`,
              bottom: n.bottom,
              zIndex: 5,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              pointerEvents: "none",
            }}
          >
            <PngAnimatedSprite
              url={sheet.url}
              frameW={sheet.frameW}
              frameH={sheet.frameH}
              frames={sheet.frames}
              row={sheet.row}
              fps={sheet.fps}
              scale={RENDER_SCALE[n.species]}
              flip={n.dir < 0}
              alt=""
            />
          </div>
        );
      })}
    </>
  );
}

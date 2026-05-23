"use client";

import { useEffect, useState } from "react";

import { AnimatedSprite } from "@/components/pixel/AnimatedSprite";
import { CAT_WALK } from "@/lib/pixel/sprites/walkers";

/**
 * Decorative scenery cat — wanders the sidewalk without a head label so
 * it reads as background life, not as a player. One entry only; see plan
 * 1-city-2-ancient-hippo.md for the 5-decorative-NPCs cap rationale.
 */

type CatNPC = {
  readonly key: "blackbean";
  readonly palette: { B: string; W: string };
  readonly speed: number; // %/frame
  readonly startX: number;
};

const NPCS: readonly CatNPC[] = [
  { key: "blackbean", palette: { B: "#0a0524", W: "#fcd34d" }, speed: 0.04, startX: 45 },
];

export function NamedCats() {
  const [pos, setPos] = useState<number[]>(() => NPCS.map((n) => n.startX));

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setPos((ps) =>
        ps.map((p, i) => {
          const np = p + NPCS[i].speed;
          return np > 100 ? np - 100 : np;
        }),
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      {NPCS.map((n, i) => (
        <div
          key={n.key}
          data-testid="named-cat"
          className="ground-anchor"
          style={{
            position: "absolute",
            left: `${pos[i]}%`,
            // 2026-05-21: aligned with new Road sidewalk strip
            // (Road: bottom 168..288; sidewalk @ 258..288).
            // City-Mode immersive: shifts with the ground stack.
            bottom: "calc(var(--ground-baseline) - var(--ground-shift, 0px))",
            zIndex: 6,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 1,
            pointerEvents: "none",
          }}
        >
          <AnimatedSprite
            frames={CAT_WALK.frames}
            palette={n.palette}
            scale={2}
            fps={3}
          />
        </div>
      ))}
    </>
  );
}

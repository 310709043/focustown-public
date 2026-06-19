"use client";

import { useEffect, useRef } from "react";

import { AnimatedSprite } from "@/components/pixel/AnimatedSprite";
import { CAT_WALK } from "@/lib/pixel/sprites/walkers";

/**
 * Decorative scenery cat — wanders the sidewalk without a head label so
 * it reads as background life, not as a player. One entry only; see plan
 * 1-city-2-ancient-hippo.md for the 5-decorative-NPCs cap rationale.
 *
 * Performance: ref-based DOM mutation, not React state.
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
  const containerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const posRef = useRef<number[]>(NPCS.map((n) => n.startX));

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    let raf = 0;
    const tick = () => {
      for (let i = 0; i < NPCS.length; i++) {
        let np = posRef.current[i] + NPCS[i].speed;
        if (np > 100) np -= 100;
        posRef.current[i] = np;
        const el = containerRefs.current[i];
        if (el) el.style.left = `${np}%`;
      }
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
          ref={(el) => { containerRefs.current[i] = el; }}
          data-testid="named-cat"
          className="ground-anchor"
          style={{
            position: "absolute",
            left: `${n.startX}%`,
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

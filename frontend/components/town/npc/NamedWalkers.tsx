"use client";

import { useEffect, useState } from "react";

import { PngAnimatedSprite } from "@/components/pixel/PngAnimatedSprite";
import { PNG_WALKERS, WALKER_SCALE_DEFAULT } from "@/lib/pixel/sprites/walkersPng";

/**
 * Decorative scenery walkers — silent NPCs that drift on the sidewalk so
 * the city never looks empty. They render WITHOUT head labels (only real
 * users + bots, driven through <Pedestrians>, get name/status/activity
 * pills) and are kept intentionally few so they read as background life,
 * not as players the user might try to interact with.
 *
 * Coexists with `<Pedestrians>` (presence-driven). Real users render on
 * top via DOM order so the player feels foregrounded among the town's
 * residents rather than competing for space with them.
 */

type WalkerNPC = {
  readonly key: "yuki" | "bear";
  readonly variantIdx: 0 | 1 | 2; // index into PNG_WALKERS
  readonly speed: number; // %/frame
  readonly startX: number; // initial left %
  readonly dir: 1 | -1;
};

// Two walkers cover both City_men variants users see most often. Keeping
// the count low is part of the "only users/bots are moving named entities"
// rule — see plan 1-city-2-ancient-hippo.md.
const NPCS: readonly WalkerNPC[] = [
  { key: "yuki", variantIdx: 0, speed: 0.025, startX: 18, dir: 1 },
  { key: "bear", variantIdx: 1, speed: 0.025, startX: 72, dir: -1 },
];

export function NamedWalkers() {
  const [pos, setPos] = useState<number[]>(() => NPCS.map((n) => n.startX));

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setPos((ps) =>
        ps.map((p, i) => {
          let np = p + NPCS[i].speed * NPCS[i].dir;
          if (np > 102) np = -4;
          if (np < -6) np = 102;
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
        const flipped = n.dir < 0;
        const walk = PNG_WALKERS[n.variantIdx].walk;
        return (
          <div
            key={n.key}
            data-testid="named-walker"
            className="ground-anchor"
            style={{
              position: "absolute",
              left: `${pos[i]}%`,
              // Sidewalk strip of the Road band (matches <Pedestrians>).
              // Road: bottom 168..288, sidewalk = top 30 px @ 258..288.
              // City-Mode immersive: shifts with the ground stack.
              bottom: "calc(var(--ground-baseline) - var(--ground-shift, 0px))",
              zIndex: 6,
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 0,
              }}
            >
              <PngAnimatedSprite
                url={walk.url}
                frameW={walk.frameW}
                frameH={walk.frameH}
                frames={walk.frames}
                fps={walk.fps}
                scale={WALKER_SCALE_DEFAULT}
                flip={flipped}
                alt=""
              />
            </div>
          </div>
        );
      })}
    </>
  );
}

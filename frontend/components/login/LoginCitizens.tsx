"use client";

import { useEffect, useMemo, useState } from "react";

import { AnimatedSprite } from "@/components/pixel/AnimatedSprite";
import { CAT_WALK, WALKERS } from "@/lib/pixel/sprites/walkers";

/**
 * Five pedestrians + one cat companion strolling at the foot of the
 * login scene. Reference uses 5 walkers from `WALKERS[0|2|5|6|4]`, each
 * with a tuned speed + direction; the cat drifts independently at
 * 28-second cycle. Positions are kept in component state and updated
 * via rAF so the motion is continuous.
 */
export function LoginCitizens() {
  // Lock the walker selection + bookkeeping per mount so React can't
  // re-shuffle who walks where on re-render.
  const cs = useMemo(
    () => [
      { walker: WALKERS[0], speed: 0.05, x: 5, dir: 1 as const },
      { walker: WALKERS[2], speed: 0.04, x: 28, dir: 1 as const },
      { walker: WALKERS[5], speed: 0.06, x: 56, dir: -1 as const },
      { walker: WALKERS[6], speed: 0.045, x: 78, dir: 1 as const },
      { walker: WALKERS[4], speed: 0.05, x: 92, dir: -1 as const },
    ],
    [],
  );
  const [pos, setPos] = useState(() => cs.map((c) => c.x));

  useEffect(() => {
    let raf: number | undefined;
    const tick = () => {
      setPos((ps) =>
        ps.map((p, i) => {
          let np = p + cs[i].speed * cs[i].dir;
          if (np > 105) np = -4;
          if (np < -6) np = 102;
          return np;
        }),
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf !== undefined) cancelAnimationFrame(raf);
    };
  }, [cs]);

  return (
    <div
      aria-hidden
      className="pointer-events-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 20,
        height: 50,
        zIndex: 1,
      }}
    >
      {cs.map((c, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${pos[i]}%`,
            bottom: 0,
            transform: c.dir < 0 ? "scaleX(-1)" : undefined,
          }}
        >
          <AnimatedSprite
            frames={c.walker.frames}
            palette={c.walker.palette}
            scale={2.2}
            fps={3}
          />
        </div>
      ))}
      <div
        className="animate-driftX"
        style={
          {
            position: "absolute",
            left: "40%",
            bottom: 4,
            ["--drift-dur" as string]: "28s",
          } as React.CSSProperties
        }
      >
        <AnimatedSprite
          frames={CAT_WALK.frames}
          palette={CAT_WALK.palette}
          scale={2}
          fps={3}
        />
      </div>
    </div>
  );
}

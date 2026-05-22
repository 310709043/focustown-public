"use client";

import { useEffect, useState } from "react";

import { PngAnimatedSprite } from "@/components/pixel/PngAnimatedSprite";
import {
  CAR_SCALE_DEFAULT,
  PNG_CARS,
} from "@/lib/pixel/sprites/carsPng";

/**
 * Decorative driving car — one anonymous vehicle that crosses the road
 * so the asphalt strip doesn't feel empty when there are no online users
 * routed to the "car" entity kind. Renders WITHOUT a head label.
 *
 * Coexists with `<CarsLane>` (presence-driven, labelled) — that overlay
 * renders one car per online citizen with a vehicle and uses a different
 * sprite source. See plan 1-city-2-ancient-hippo.md.
 */

type CarNPC = {
  readonly key: "ubermira";
  readonly model: "jeep1" | "passenger";
  readonly speed: number; // %/frame
  readonly startX: number;
  readonly dir: 1 | -1;
};

const NPCS: readonly CarNPC[] = [
  { key: "ubermira", model: "jeep1", speed: 0.22, startX: 10, dir: 1 },
];

export function NamedCars() {
  const [pos, setPos] = useState<number[]>(() => NPCS.map((n) => n.startX));

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setPos((ps) =>
        ps.map((p, i) => {
          let np = p + NPCS[i].speed * NPCS[i].dir;
          if (np > 115) np = -10;
          if (np < -10) np = 115;
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
        const sheet = PNG_CARS[n.model].ride;
        return (
          <div
            key={n.key}
            data-testid="named-car"
            className="ground-anchor"
            style={{
              position: "absolute",
              left: `${pos[i]}%`,
              // Asphalt portion of the Road band (matches <CarsLane>).
              // Road: bottom 168..288, asphalt = bottom 90 px @ 168..258.
              // City-Mode immersive: shifts with the ground stack.
              bottom: "calc(175px - var(--ground-shift, 0px))",
              zIndex: 5,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 1,
              pointerEvents: "none",
            }}
          >
            <PngAnimatedSprite
              url={sheet.url}
              frameW={sheet.frameW}
              frameH={sheet.frameH}
              frames={sheet.frames}
              fps={sheet.fps}
              scale={CAR_SCALE_DEFAULT}
              flip={n.dir < 0}
              alt=""
            />
          </div>
        );
      })}
    </>
  );
}

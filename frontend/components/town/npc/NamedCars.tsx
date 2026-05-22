"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { PngAnimatedSprite } from "@/components/pixel/PngAnimatedSprite";
import {
  CAR_SCALE_DEFAULT,
  PNG_CARS,
} from "@/lib/pixel/sprites/carsPng";

/**
 * Reference-design driving cars — Phase 1.G port to 876810 PNG sheets.
 *
 * 3 named vehicles cross the bottom of the screen, mapped to 2 canonical
 * car types: Jeep_1 (twice — different lanes / directions) + Passenger.
 * Ride action loops at 10fps. Direction reversal uses CSS flip rather
 * than the alternate Ride_back asset to keep the canonical asset count
 * small and the render path uniform.
 *
 * NOT to confuse with `<CarsLane>`: that overlay renders presence-driven
 * vehicles (one per online citizen with a vehicle equipped) and uses a
 * different sprite source (`lib/pixel/sprites/world.ts:buildCar`). The
 * two coexist — NamedCars are scenery; CarsLane is presence.
 */

type CarNPC = {
  readonly key: "ubermira" | "boltren" | "gogolin";
  readonly model: "jeep1" | "passenger";
  readonly speed: number; // %/frame
  readonly startX: number;
  readonly dir: 1 | -1;
};

const NPCS: readonly CarNPC[] = [
  { key: "ubermira", model: "jeep1",     speed: 0.22, startX: 10, dir: 1  },
  { key: "boltren",  model: "passenger", speed: 0.18, startX: 50, dir: -1 },
  { key: "gogolin",  model: "jeep1",     speed: 0.16, startX: 80, dir: 1  },
];

export function NamedCars() {
  const t = useTranslations("town.scene.npc.cars");
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
            <span
              className="font-silkscreen"
              style={{
                fontSize: 7,
                color: "var(--ink)",
                background: "rgba(15,20,38,0.85)",
                padding: "0 3px",
                border: "1px solid var(--panel-stroke)",
                whiteSpace: "nowrap",
              }}
            >
              {t(`${n.key}.name`)}
              <span style={{ color: "var(--accent-3)", marginLeft: 4 }}>
                · {t(`${n.key}.status`)}
              </span>
            </span>
            <PngAnimatedSprite
              url={sheet.url}
              frameW={sheet.frameW}
              frameH={sheet.frameH}
              frames={sheet.frames}
              fps={sheet.fps}
              scale={CAR_SCALE_DEFAULT}
              flip={n.dir < 0}
              alt={t(`${n.key}.name`)}
            />
          </div>
        );
      })}
    </>
  );
}

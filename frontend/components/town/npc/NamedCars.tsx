"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { PixelSprite } from "@/components/pixel/PixelSprite";

/**
 * Reference-design driving cars — port of
 * `reference/screen-town.jsx#DrivingCars` + `CarSprite` (lines 932–998).
 * Three named scenery vehicles (sedan / truck / scooter shapes) drive
 * across the bottom of the screen with a soft neon glow.
 *
 * Sprites are inline because they aren't used elsewhere. `buildCar()`
 * in `lib/pixel/sprites/world.ts` builds a different presence-driven
 * sprite for the existing `<CarsLane>` overlay — not interchangeable.
 */

const SEDAN = `
.....XXXXXX....
....XXXXXXXX...
...XXWWWXWWXX..
..XXXXXXXXXXX..
.KK.KK....KK.K.
`;
const TRUCK = `
..XXXXXXXXXX...
..XXXXXXXXXX...
..XXXWWWWWWX...
..XXXWWWWWWX...
..XXXXXXXXXX...
.KK..KK..KK.K..
`;
const SCOOTER = `
...XXXXXXX....
..XXXWWWXX....
..XXXXXXXX....
..KK....KK....
`;

const CAR_SPRITES: readonly string[] = [SEDAN, TRUCK, SCOOTER];

type CarNPC = {
  readonly key: "ubermira" | "boltren" | "gogolin";
  readonly color: string;
  readonly speed: number; // %/frame
  readonly startX: number;
  /** Index into CAR_SPRITES. */
  readonly kind: 0 | 1 | 2;
};

const NPCS: readonly CarNPC[] = [
  { key: "ubermira", color: "#22d3ee", speed: 0.22, startX: 10, kind: 0 },
  { key: "boltren",  color: "#ec4899", speed: 0.18, startX: 50, kind: 1 },
  { key: "gogolin",  color: "#fbbf24", speed: 0.16, startX: 80, kind: 2 },
];

export function NamedCars() {
  const t = useTranslations("town.scene.npc.cars");
  const [pos, setPos] = useState<number[]>(() => NPCS.map((n) => n.startX));

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setPos((ps) =>
        ps.map((p, i) => {
          let np = p + NPCS[i].speed;
          if (np > 115) np = -10;
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
      {NPCS.map((n, i) => (
        <div
          key={n.key}
          data-testid="named-car"
          style={{
            position: "absolute",
            left: `${pos[i]}%`,
            bottom: 4,
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
              color: n.color,
              background: "rgba(7,4,26,0.85)",
              padding: "0 3px",
              border: `1px solid ${n.color}55`,
              whiteSpace: "nowrap",
              textShadow: `0 0 3px ${n.color}`,
            }}
          >
            {t(`${n.key}.name`)} · {t(`${n.key}.status`)}
          </span>
          <PixelSprite
            sprite={CAR_SPRITES[n.kind]}
            palette={{ X: n.color, W: "#fcd34d", K: "#0a0524" }}
            scale={2.5}
            glow={`${n.color}aa`}
          />
        </div>
      ))}
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { PngAnimatedSprite } from "@/components/pixel/PngAnimatedSprite";
import { PNG_WALKERS, WALKER_SCALE_DEFAULT } from "@/lib/pixel/sprites/walkersPng";

/**
 * Reference-design named walkers — 7 scenery citizens that drift on the
 * sidewalk regardless of how many real users are online. Phase 1.F port:
 * swaps the legacy 8×14 inline char-grid sprites (lib/pixel/sprites/walkers.ts)
 * to the 516149 City_men PNG sheets via `<PngAnimatedSprite>`.
 *
 * 7 named NPCs distribute over 3 City_men variants. Each NPC gets a fixed
 * variant index to preserve identity across the day-cycle — Yuki always
 * looks like City_men_1, Aria always like City_men_2, etc.
 *
 * Coexists with `<Pedestrians>` (presence-driven). Real users render on
 * top via DOM order so the player feels foregrounded among the town's
 * residents rather than competing for space with them.
 */

type WalkerNPC = {
  readonly key: "yuki" | "aria" | "kai" | "doc" | "bear" | "milo" | "nova";
  readonly variantIdx: 0 | 1 | 2; // index into PNG_WALKERS
  readonly speed: number; // %/frame
  readonly startX: number; // initial left %
  readonly dir: 1 | -1;
};

const NPCS: readonly WalkerNPC[] = [
  { key: "yuki", variantIdx: 0, speed: 0.05, startX: 5,  dir: 1 },
  { key: "aria", variantIdx: 1, speed: 0.04, startX: 22, dir: 1 },
  { key: "kai",  variantIdx: 2, speed: 0.06, startX: 38, dir: 1 },
  { key: "doc",  variantIdx: 0, speed: 0.04, startX: 52, dir: -1 },
  { key: "bear", variantIdx: 1, speed: 0.05, startX: 66, dir: 1 },
  { key: "milo", variantIdx: 2, speed: 0.05, startX: 80, dir: -1 },
  { key: "nova", variantIdx: 0, speed: 0.05, startX: 93, dir: 1 },
];

export function NamedWalkers() {
  const t = useTranslations("town.scene.npc.walkers");
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
            style={{
              position: "absolute",
              left: `${pos[i]}%`,
              // Sidewalk strip of the Road band (matches <Pedestrians>).
              // Road: bottom 168..288, sidewalk = top 30 px @ 258..288.
              bottom: 258,
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
              <span
                className="font-silkscreen"
                style={{
                  fontSize: 8,
                  color: "var(--ink)",
                  background: "rgba(15,20,38,0.85)",
                  padding: "1px 4px",
                  border: "1px solid var(--panel-stroke)",
                  whiteSpace: "nowrap",
                  letterSpacing: "0.05em",
                  marginBottom: 1,
                }}
              >
                {t(`${n.key}.name`)}
                <span style={{ color: "var(--accent-3)", marginLeft: 4 }}>
                  · {t(`${n.key}.status`)}
                </span>
              </span>
              <PngAnimatedSprite
                url={walk.url}
                frameW={walk.frameW}
                frameH={walk.frameH}
                frames={walk.frames}
                fps={walk.fps}
                scale={WALKER_SCALE_DEFAULT}
                flip={flipped}
                alt={t(`${n.key}.name`)}
              />
            </div>
          </div>
        );
      })}
    </>
  );
}

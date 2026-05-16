"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { AnimatedSprite } from "@/components/pixel/AnimatedSprite";
import { WALKERS } from "@/lib/pixel/sprites/walkers";

/**
 * Reference-design named walkers — 7 scenery citizens that drift on the
 * sidewalk regardless of how many real users are online. Port of
 * `reference/screen-town.jsx#WalkingCitizens` (lines 851–899).
 *
 * Coexists with `<Pedestrians>` (presence-driven). Real users render
 * on top via DOM order so the player feels foregrounded among the
 * town's residents rather than competing for space with them.
 */

type WalkerNPC = {
  readonly key: "yuki" | "aria" | "kai" | "doc" | "bear" | "milo" | "nova";
  readonly walker: number; // index into WALKERS[]
  readonly speed: number; // %/frame
  readonly startX: number; // initial left %
  readonly dir: 1 | -1;
};

const NPCS: readonly WalkerNPC[] = [
  { key: "yuki", walker: 0, speed: 0.05, startX: 5,  dir: 1 },
  { key: "aria", walker: 2, speed: 0.04, startX: 22, dir: 1 },
  { key: "kai",  walker: 5, speed: 0.06, startX: 38, dir: 1 },
  { key: "doc",  walker: 1, speed: 0.04, startX: 52, dir: -1 },
  { key: "bear", walker: 4, speed: 0.05, startX: 66, dir: 1 },
  { key: "milo", walker: 6, speed: 0.05, startX: 80, dir: -1 },
  { key: "nova", walker: 7, speed: 0.05, startX: 93, dir: 1 },
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
        return (
          <div
            key={n.key}
            data-testid="named-walker"
            style={{
              position: "absolute",
              left: `${pos[i]}%`,
              bottom: 56,
              zIndex: 6,
              transform: flipped ? "scaleX(-1)" : undefined,
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
                  background: "rgba(7,4,26,0.85)",
                  padding: "1px 4px",
                  border: "1px solid var(--panel-stroke)",
                  whiteSpace: "nowrap",
                  letterSpacing: "0.05em",
                  // Keep label readable when the parent is mirrored.
                  transform: flipped ? "scaleX(-1)" : undefined,
                  marginBottom: 1,
                }}
              >
                {t(`${n.key}.name`)}
                <span style={{ color: "var(--accent-3)", marginLeft: 4 }}>
                  · {t(`${n.key}.status`)}
                </span>
              </span>
              <AnimatedSprite
                frames={WALKERS[n.walker].frames}
                palette={WALKERS[n.walker].palette}
                scale={2.4}
                fps={3}
              />
            </div>
          </div>
        );
      })}
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { AnimatedSprite } from "@/components/pixel/AnimatedSprite";
import { CAT_WALK } from "@/lib/pixel/sprites/walkers";

/**
 * Reference-design wandering cats — port of
 * `reference/screen-town.jsx#WanderingCats` (lines 901–929). Repalettes
 * the shared `CAT_WALK` sprite via its `B`/`W` keys.
 */

type CatNPC = {
  readonly key: "blackbean" | "milktea";
  readonly palette: { B: string; W: string };
  readonly speed: number; // %/frame
  readonly startX: number;
};

const NPCS: readonly CatNPC[] = [
  { key: "blackbean", palette: { B: "#0a0524", W: "#fcd34d" }, speed: 0.04, startX: 30 },
  { key: "milktea",   palette: { B: "#fef9c3", W: "#92400e" }, speed: 0.03, startX: 70 },
];

export function NamedCats() {
  const t = useTranslations("town.scene.npc.cats");
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
          style={{
            position: "absolute",
            left: `${pos[i]}%`,
            bottom: 55,
            zIndex: 6,
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
              color: "var(--accent-2)",
              background: "rgba(7,4,26,0.85)",
              padding: "0 3px",
              border: "1px solid var(--panel-stroke)",
              whiteSpace: "nowrap",
            }}
          >
            🐾 {t(`${n.key}.name`)} · {t(`${n.key}.status`)}
          </span>
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

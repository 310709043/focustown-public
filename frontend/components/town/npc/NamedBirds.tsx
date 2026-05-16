"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { AnimatedSprite } from "@/components/pixel/AnimatedSprite";

/**
 * Reference-design named flying birds — port of
 * `reference/screen-town.jsx#Birds` (lines 468–517). Sprite art is
 * inline because only this component consumes it (no other caller).
 */

const BIRD_FRAME_1 = `
.BB....BB.
BBBB..BBBB
.BBBBBBBB.
..BBBBBB..
`;
const BIRD_FRAME_2 = `
.B......B.
BBB....BBB
.BBBBBBBB.
..BBBBBB..
`;

const BIRD_FRAMES: readonly string[] = [BIRD_FRAME_1, BIRD_FRAME_2];

type BirdNPC = {
  readonly key: "whisp" | "echo" | "wren";
  readonly color: string;
  readonly y: number; // top px
  readonly speed: number; // %/frame
  readonly startX: number;
};

const NPCS: readonly BirdNPC[] = [
  { key: "whisp", color: "#a78bfa", y: 90,  speed: 0.15, startX: 10 },
  { key: "echo",  color: "#22d3ee", y: 130, speed: 0.18, startX: 40 },
  { key: "wren",  color: "#fcd34d", y: 160, speed: 0.12, startX: 70 },
];

export function NamedBirds() {
  const t = useTranslations("town.scene.npc.birds");
  const [pos, setPos] = useState<number[]>(() => NPCS.map((n) => n.startX));

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setPos((ps) =>
        ps.map((p, i) => {
          let np = p + NPCS[i].speed;
          if (np > 105) np = -8;
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
          data-testid="named-bird"
          style={{
            position: "absolute",
            left: `${pos[i]}%`,
            top: n.y,
            zIndex: 4,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            pointerEvents: "none",
          }}
        >
          <span
            className="font-silkscreen"
            style={{
              fontSize: 8,
              color: n.color,
              background: "rgba(7,4,26,0.7)",
              padding: "0px 4px",
              border: `1px solid ${n.color}55`,
              marginBottom: 2,
              whiteSpace: "nowrap",
              letterSpacing: "0.05em",
              textShadow: `0 0 4px ${n.color}`,
            }}
          >
            {t(`${n.key}.name`)} · {t(`${n.key}.status`)}
          </span>
          <AnimatedSprite
            frames={BIRD_FRAMES}
            palette={{ B: n.color }}
            scale={2}
            fps={6}
            glow={`${n.color}aa`}
          />
        </div>
      ))}
    </>
  );
}

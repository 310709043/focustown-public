"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { PngAnimatedSprite } from "@/components/pixel/PngAnimatedSprite";
import { PNG_BIRDS } from "@/lib/pixel/sprites/birdsPng";

/**
 * Reference-design named ground-walking birds — Phase 1.G port.
 *
 * Previously this component rendered 3 sky-flying birds (Whisp / Echo /
 * Wren) as inline 4×10 char-grids in flight. Per
 * docs/qa/canonical-reference-index.md § 1.1 layer 72 the v6 canon repaints
 * them as ground-walking chicks + rooster from the 291971 farm pack —
 * smaller silhouettes, at street level, slow horizontal drift rather than
 * sky-band flight. Names are preserved so existing i18n keys still resolve.
 *
 * 3 NPCs distribute over 2 species (2 chicks + 1 rooster) for size variety.
 */

type BirdNPC = {
  readonly key: "whisp" | "echo" | "wren";
  readonly species: "chick" | "rooster";
  readonly bottom: number; // bottom px from viewport floor
  readonly speed: number; // %/frame drift
  readonly startX: number;
  readonly dir: 1 | -1;
};

const NPCS: readonly BirdNPC[] = [
  { key: "whisp", species: "chick",   bottom: 38, speed: 0.05, startX: 18, dir: 1 },
  { key: "echo",  species: "rooster", bottom: 32, speed: 0.04, startX: 48, dir: -1 },
  { key: "wren",  species: "chick",   bottom: 42, speed: 0.06, startX: 75, dir: 1 },
];

const RENDER_SCALE: Record<"chick" | "rooster", number> = {
  chick: 2.0,   // 16x16 → 32x32 — readable but not dominating
  rooster: 1.5, // 32x32 → 48x48 — slightly larger than the chicks
};

export function NamedBirds() {
  const t = useTranslations("town.scene.npc.birds");
  const [pos, setPos] = useState<number[]>(() => NPCS.map((n) => n.startX));

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setPos((ps) =>
        ps.map((p, i) => {
          let np = p + NPCS[i].speed * NPCS[i].dir;
          if (np > 105) np = -4;
          if (np < -6) np = 105;
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
        const sheet = PNG_BIRDS[n.species];
        return (
          <div
            key={n.key}
            data-testid="named-bird"
            style={{
              position: "absolute",
              left: `${pos[i]}%`,
              bottom: n.bottom,
              zIndex: 5,
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
                color: "var(--ink)",
                background: "rgba(15,20,38,0.7)",
                padding: "0px 4px",
                border: "1px solid var(--panel-stroke)",
                marginBottom: 1,
                whiteSpace: "nowrap",
                letterSpacing: "0.05em",
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
              row={sheet.row}
              fps={sheet.fps}
              scale={RENDER_SCALE[n.species]}
              flip={n.dir < 0}
              alt={t(`${n.key}.name`)}
            />
          </div>
        );
      })}
    </>
  );
}

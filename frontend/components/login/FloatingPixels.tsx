"use client";

import { PixelSprite } from "@/components/pixel/PixelSprite";
import { COFFEE, NOTE } from "@/lib/pixel/sprites/props";

/**
 * Four ambient props drift across the login scene at varying heights.
 * Reference alternates COFFEE (driftX) and NOTE (driftXRev, mirrored) so
 * the eye sees both directions of flow. Negative `animationDelay`
 * pre-rolls each item so the scene doesn't start with the whole row
 * lined up at the left edge.
 */
interface Item {
  readonly y: string;
  readonly sprite: typeof COFFEE | typeof NOTE;
  readonly scale: number;
  readonly dur: number;
  readonly delay: number;
  readonly glow?: string;
  readonly rev?: boolean;
}

const ITEMS: readonly Item[] = [
  { y: "18%", sprite: COFFEE, scale: 3, dur: 38, delay: 0 },
  { y: "24%", sprite: NOTE, scale: 3, dur: 32, delay: 6, glow: "var(--accent-3)", rev: true },
  { y: "32%", sprite: COFFEE, scale: 2, dur: 42, delay: 12 },
  { y: "38%", sprite: NOTE, scale: 2, dur: 35, delay: 18, glow: "var(--accent-3)", rev: true },
];

export function FloatingPixels() {
  return (
    <>
      {ITEMS.map((it, i) => (
        <div
          key={i}
          aria-hidden
          className={`pointer-events-none ${it.rev ? "animate-driftXRev" : "animate-driftX"}`}
          style={
            {
              position: "absolute",
              top: it.y,
              left: 0,
              opacity: 0.85,
              zIndex: 1,
              ["--drift-dur" as string]: `${it.dur}s`,
              ["--drift-delay" as string]: `-${it.delay}s`,
            } as React.CSSProperties
          }
        >
          <PixelSprite
            sprite={it.sprite.sprite}
            palette={it.sprite.palette}
            scale={it.scale}
            glow={it.glow ?? null}
          />
        </div>
      ))}
    </>
  );
}

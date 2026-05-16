"use client";

import { PixelSprite } from "@/components/pixel/PixelSprite";
import { TOMATO } from "@/lib/pixel/sprites/props";

const DIM_PALETTE = { R: "#3a2820", G: "#1a0f3d", W: "#5a4a7a" } as const;

interface TomatoStripProps {
  /** Number of "lit" tomatoes — indices < count get the full palette. */
  count: number;
  /** Total chips in the strip (default 8 per reference). */
  max?: number;
  /** Sprite scale; 1.4 for solo BigTimer / 1.3 for town BottomHUD. */
  scale?: number;
  /** Inter-chip gap. */
  gap?: number;
}

/**
 * Horizontal strip of `max` tomato chips. The first `count` use the full
 * `TOMATO` palette; the rest use a dim palette so the strip reads as
 * "progress today vs the daily goal" at a glance.
 *
 * Shared primitive — consumed by:
 *  - Page 4 `BigTimer` (scale 1.4, max 8)
 *  - C1 `FocusTimer` (bottom HUD variant, scale 1.3, max 8)
 *  - Phase E `SharedTimer` (scale 1.3, max 8)
 */
export function TomatoStrip({
  count,
  max = 8,
  scale = 1.4,
  gap = 4,
}: TomatoStripProps) {
  return (
    <div
      data-testid="tomato-strip"
      style={{ display: "flex", gap, alignItems: "center" }}
    >
      {Array.from({ length: max }).map((_, i) => (
        <PixelSprite
          key={i}
          sprite={TOMATO.sprite}
          palette={i < count ? TOMATO.palette : DIM_PALETTE}
          scale={scale}
        />
      ))}
    </div>
  );
}

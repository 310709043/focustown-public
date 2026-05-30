"use client";

import { PixelSprite } from "@/components/pixel/PixelSprite";
import { BATTERY } from "@/lib/pixel/sprites/props";

const DIM_PALETTE = { B: "#1e2a35", G: "#1a2e1a" } as const;

interface BatteryStripProps {
  /** Number of "lit" batteries — indices < count get the full palette + pulse. */
  count: number;
  /** Total chips in the strip (default 8 per reference). */
  max?: number;
  /** Sprite scale; 1.4 for solo BigTimer / 1.3 for town BottomHUD. */
  scale?: number;
  /** Inter-chip gap. */
  gap?: number;
}

/**
 * Horizontal strip of `max` battery chips. The first `count` use the full
 * `BATTERY` palette with a charging-pulse animation; the rest use a dim
 * palette so the strip reads as "progress today vs the daily goal" at a glance.
 *
 * Shared primitive — consumed by:
 *  - Page 4 `BigTimer` (scale 1.4, max 8)
 *  - C1 `FocusTimer` (bottom HUD variant, scale 1.3, max 8)
 *  - Phase E `SharedTimer` (scale 1.3, max 8)
 */
export function BatteryStrip({
  count,
  max = 8,
  scale = 1.4,
  gap = 4,
}: BatteryStripProps) {
  return (
    <div
      data-testid="battery-strip"
      style={{ display: "flex", gap, alignItems: "center" }}
    >
      {Array.from({ length: max }).map((_, i) => {
        const active = i < count;
        return (
          <div
            key={i}
            style={
              active
                ? {
                    animation: "batteryPulse 1.8s ease-in-out infinite",
                    animationDelay: `${i * 0.12}s`,
                  }
                : undefined
            }
          >
            <PixelSprite
              sprite={BATTERY.sprite}
              palette={active ? BATTERY.palette : DIM_PALETTE}
              scale={scale}
            />
          </div>
        );
      })}
    </div>
  );
}

/** @deprecated Use BatteryStrip */
export { BatteryStrip as TomatoStrip };

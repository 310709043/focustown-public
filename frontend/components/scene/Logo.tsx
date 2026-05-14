"use client";

import { PixelWord } from "@/components/pixel/PixelWord";

type Props = {
  scale?: number;
  glow?: boolean;
  className?: string;
};

// `scale=1` legacy = 40px square PNG. The pixel wordmark is 7 rows tall
// at scale=1, so we multiply by ~3 to land in a similar visual weight.
const PIXEL_SCALE_MULTIPLIER = 3;

export function Logo({ scale = 1, glow = true, className }: Props) {
  const pixelScale = Math.max(2, Math.round(scale * PIXEL_SCALE_MULTIPLIER));
  return (
    <PixelWord
      text="FocusTown"
      color="var(--a2)"
      glow={glow ? "var(--a3)" : null}
      scale={pixelScale}
      className={className}
    />
  );
}

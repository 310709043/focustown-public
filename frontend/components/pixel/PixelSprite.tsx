"use client";

import { type CSSProperties, useMemo } from "react";

import { type Palette, spriteSize, spriteToDataURL } from "@/lib/pixel/sprite";

export interface PixelSpriteProps {
  sprite: string;
  palette: Palette;
  scale?: number;
  flip?: boolean;
  glow?: string | null;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

export function PixelSprite({
  sprite,
  palette,
  scale = 4,
  flip = false,
  glow = null,
  className,
  style,
  title,
}: PixelSpriteProps) {
  const { w, h } = useMemo(() => spriteSize(sprite), [sprite]);
  const url = useMemo(() => spriteToDataURL(sprite, palette), [sprite, palette]);

  // The data URL differs between SSR (placeholder) and CSR (real canvas
  // output) — that's by design. Tell React this is intentional so it
  // doesn't tear down the subtree as a hydration mismatch.
  return (
    <span
      role={title ? "img" : undefined}
      aria-label={title}
      title={title}
      className={className}
      suppressHydrationWarning
      style={{
        display: "inline-block",
        width: w * scale,
        height: h * scale,
        backgroundImage: `url(${url})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: "100% 100%",
        imageRendering: "pixelated",
        transform: flip ? "scaleX(-1)" : undefined,
        filter: glow ? `drop-shadow(0 0 ${scale}px ${glow})` : undefined,
        ...style,
      }}
    />
  );
}

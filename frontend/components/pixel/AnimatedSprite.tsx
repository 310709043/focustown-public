"use client";

import { type CSSProperties, useEffect, useState } from "react";

import { type Palette } from "@/lib/pixel/sprite";

import { BASE_FPS, useFrameTick } from "./FrameTicker";
import { PixelSprite } from "./PixelSprite";

export interface AnimatedSpriteProps {
  frames: readonly string[];
  palette: Palette;
  fps?: number;
  scale?: number;
  flip?: boolean;
  glow?: string | null;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

/**
 * Multi-frame pixel sprite. If a `<FrameTicker>` provider is mounted above,
 * derives the current frame from the shared counter (no local timer).
 * Otherwise falls back to its own `setInterval` so standalone usage still
 * animates.
 *
 * Single-frame sprites short-circuit both paths — no timer at all.
 */
export function AnimatedSprite({
  frames,
  palette,
  fps = 4,
  scale = 4,
  flip = false,
  glow = null,
  className,
  style,
  title,
}: AnimatedSpriteProps) {
  const sharedFrame = useFrameTick();
  const [localIdx, setLocalIdx] = useState(0);

  useEffect(() => {
    if (sharedFrame !== null) return; // shared ticker owns the timing
    if (frames.length <= 1) return; // no animation needed
    const id = window.setInterval(
      () => setLocalIdx((i) => (i + 1) % frames.length),
      1000 / fps,
    );
    return () => window.clearInterval(id);
  }, [sharedFrame, frames.length, fps]);

  const idx =
    sharedFrame !== null
      ? Math.floor((sharedFrame * fps) / BASE_FPS) % frames.length
      : localIdx;

  const frame = frames[idx] ?? frames[0] ?? "";

  return (
    <PixelSprite
      sprite={frame}
      palette={palette}
      scale={scale}
      flip={flip}
      glow={glow}
      className={className}
      style={style}
      title={title}
    />
  );
}

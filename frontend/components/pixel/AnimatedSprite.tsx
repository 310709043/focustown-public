"use client";

import { type CSSProperties, useEffect, useState } from "react";

import { type Palette } from "@/lib/pixel/sprite";

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
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (frames.length <= 1) return;
    const id = window.setInterval(
      () => setIdx((i) => (i + 1) % frames.length),
      1000 / fps,
    );
    return () => window.clearInterval(id);
  }, [frames.length, fps]);

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

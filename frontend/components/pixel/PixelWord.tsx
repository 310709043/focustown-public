"use client";

import { type CSSProperties, useMemo } from "react";

import { renderWord, wordmarkPalette } from "@/lib/pixel/sprites/wordmark";

import { PixelSprite } from "./PixelSprite";

export interface PixelWordProps {
  text: string;
  /** On-pixel color. CSS variables like "var(--a2)" work. */
  color?: string;
  /** Optional drop-shadow glow color. */
  glow?: string | null;
  scale?: number;
  className?: string;
  style?: CSSProperties;
}

export function PixelWord({
  text,
  color = "var(--a2)",
  glow = null,
  scale = 3,
  className,
  style,
}: PixelWordProps) {
  const sprite = useMemo(() => renderWord(text), [text]);
  const palette = useMemo(() => wordmarkPalette(color), [color]);
  return (
    <PixelSprite
      sprite={sprite}
      palette={palette}
      scale={scale}
      glow={glow}
      className={className}
      style={style}
      title={text}
    />
  );
}

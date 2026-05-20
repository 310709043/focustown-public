"use client";

import { type CSSProperties, useEffect, useState } from "react";

import { EMPTY_DATA_URL, pngFrameDataUrl } from "@/lib/pixel/pngSprite";

import { BASE_FPS, useFrameTick } from "./FrameTicker";

/**
 * PNG-sheet animated sprite. Parallel to <AnimatedSprite> (which consumes
 * char-grid strings) — same shared-FrameTicker timing contract, but the
 * underlying frame source is a PNG sprite sheet plus (col, row) slicing
 * via `@/lib/pixel/pngSprite`.
 *
 * SOLID:
 * - Single responsibility: this component renders the CURRENT frame of a
 *   horizontal PNG sheet at a controllable fps + scale. It does not own
 *   the sheet layout (caller passes frame dims + count), nor the timer
 *   (FrameTicker owns shared timing).
 * - Open/closed: a future grid-sheet variant (top-down multi-row) can be
 *   added as a sibling component without modifying this one.
 * - Dependency inversion: depends on `pngLinearFrameDataUrl` (an
 *   abstraction over canvas slicing + caching) rather than on `<canvas>`
 *   or `Image` directly.
 *
 * Async-by-construction: the slice operation is a Promise, so we
 * pessimistically render `EMPTY_DATA_URL` (1×1 transparent GIF) on first
 * mount until the dataURL resolves. Subsequent frame switches in a long
 * animation cycle hit the LRU cache and resolve synchronously next tick.
 */

export interface PngAnimatedSpriteProps {
  /** Sheet URL — e.g. `/assets/v6/walkers/City_men_1_Walk.png` */
  readonly url: string;
  /** Cell width in source pixels */
  readonly frameW: number;
  /** Cell height in source pixels */
  readonly frameH: number;
  /** Total number of frames in this sheet (horizontal row count) */
  readonly frames: number;
  /** Row index for multi-row sheets (top-down direction). Defaults 0. */
  readonly row?: number;
  /** Animation fps. Defaults to 8. */
  readonly fps?: number;
  /** Render scale (1 = native). 0.45 maps 128×128 → 58×58. */
  readonly scale?: number;
  /** Mirror horizontally for direction reversal */
  readonly flip?: boolean;
  readonly className?: string;
  readonly style?: CSSProperties;
  /** Accessible label; defaults to empty for decorative sprites */
  readonly alt?: string;
}

export function PngAnimatedSprite({
  url,
  frameW,
  frameH,
  frames,
  row = 0,
  fps = 8,
  scale = 1,
  flip = false,
  className,
  style,
  alt = "",
}: PngAnimatedSpriteProps) {
  const sharedFrame = useFrameTick();
  const [localIdx, setLocalIdx] = useState(0);
  const [frameUrl, setFrameUrl] = useState<string>(EMPTY_DATA_URL);

  // Local timer fallback when no shared FrameTicker is mounted (mirrors
  // AnimatedSprite's contract).
  useEffect(() => {
    if (sharedFrame !== null) return;
    if (frames <= 1) return;
    const id = window.setInterval(
      () => setLocalIdx((i) => (i + 1) % frames),
      1000 / fps,
    );
    return () => window.clearInterval(id);
  }, [sharedFrame, frames, fps]);

  const idx =
    sharedFrame !== null
      ? Math.floor((sharedFrame * fps) / BASE_FPS) % Math.max(1, frames)
      : localIdx;

  useEffect(() => {
    let cancelled = false;
    pngFrameDataUrl(url, idx, row, frameW, frameH).then((dataUrl) => {
      if (!cancelled) setFrameUrl(dataUrl);
    }).catch(() => {
      // 404 / decode failure — leave the transparent placeholder so the
      // layout doesn't reflow, and let the caller's surrounding label or
      // bounding box still position correctly.
    });
    return () => {
      cancelled = true;
    };
  }, [url, idx, row, frameW, frameH]);

  const renderW = Math.round(frameW * scale);
  const renderH = Math.round(frameH * scale);

  // pixel art: next/image's optimizer would re-encode and break the
  // `image-rendering: pixelated` look. Plain <img> is correct here.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={frameUrl}
      alt={alt}
      width={renderW}
      height={renderH}
      className={className}
      style={{
        imageRendering: "pixelated",
        transform: flip ? "scaleX(-1)" : undefined,
        ...style,
      }}
      draggable={false}
    />
  );
}

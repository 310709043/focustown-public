"use client";

import { useEffect, useRef } from "react";

interface RainOverlayProps {
  /** Color of the rain streaks; cyan reads on neon, magenta on dusk. */
  color?: string;
  /** 0–1 multiplier on the seeded drop count. */
  density?: number;
  /** Cap to keep low-end devices honest. */
  maxDrops?: number;
  className?: string;
}

interface Drop {
  x: number;
  y: number;
  v: number;
  len: number;
}

/**
 * Diagonal rain particles for the `rain` and `storm` scenes. Drops fall
 * with a slight horizontal drift and a fading 4–10 px streak; each one
 * re-spawns at a random offscreen x when it hits the bottom so the
 * field stays full. Capped at `maxDrops` so the loop's per-frame work
 * stays bounded regardless of viewport size.
 */
export function RainOverlay({
  color = "#00f5d4",
  density = 1,
  maxDrops = 80,
  className,
}: RainOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let drops: Drop[] = [];
    let raf: number | undefined;

    const seed = () => {
      const w = (canvas.width = Math.max(1, canvas.clientWidth));
      const h = (canvas.height = Math.max(1, canvas.clientHeight));
      const desired = Math.min(maxDrops, Math.floor((w / 8) * density));
      drops = [];
      for (let i = 0; i < desired; i++) {
        drops.push({
          x: Math.random() * w,
          y: Math.random() * h,
          v: 6 + Math.random() * 6,
          len: 4 + Math.floor(Math.random() * 6),
        });
      }
    };

    const tick = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = color;
      for (const d of drops) {
        d.y += d.v;
        d.x -= d.v * 0.3;
        if (d.y > h) {
          d.y = -d.len;
          d.x = Math.random() * w + w * 0.2;
        }
        for (let k = 0; k < d.len; k++) {
          ctx.globalAlpha = (1 - k / d.len) * 0.35;
          ctx.fillRect(d.x + k * 0.3, d.y - k, 1, 1);
        }
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(tick);
    };

    const ro = new ResizeObserver(() => seed());
    ro.observe(canvas);
    seed();
    raf = requestAnimationFrame(tick);

    return () => {
      if (raf !== undefined) cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [color, density, maxDrops]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        imageRendering: "pixelated",
        pointerEvents: "none",
        opacity: 0.7,
      }}
    />
  );
}

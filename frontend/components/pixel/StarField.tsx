"use client";

import { useEffect, useRef } from "react";

interface StarFieldProps {
  /** Stars per pixel² — reference default is 0.0015. */
  density?: number;
  /** When false, stars hold steady opacity instead of pulsing. */
  twinkle?: boolean;
  /** Color choices the seeder picks from per-star. */
  palette?: readonly string[];
  /** Overall fade applied via inline opacity; lets the scene store dim
   *  the whole field (e.g. `day` → 0) without re-seeding. */
  opacity?: number;
  className?: string;
}

const DEFAULT_PALETTE = ["#fff", "#cfd", "#dcf", "#ffd"] as const;

interface Star {
  x: number;
  y: number;
  col: string;
  phase: number;
  big: boolean;
}

/**
 * Procedural twinkling starfield rendered to a `<canvas>` that fills
 * its positioned parent. ResizeObserver re-seeds stars on viewport
 * change so density stays consistent across responsive layouts.
 *
 * Cleanup discipline: a single rAF handle is cancelled on unmount and
 * the observer is disconnected — otherwise route changes on /town would
 * stack a new loop on every visit.
 */
export function StarField({
  density = 0.0015,
  twinkle = true,
  palette = DEFAULT_PALETTE,
  opacity = 1,
  className,
}: StarFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let stars: Star[] = [];
    let raf: number | undefined;

    const seed = () => {
      const w = (canvas.width = Math.max(1, canvas.clientWidth));
      const h = (canvas.height = Math.max(1, canvas.clientHeight));
      const n = Math.floor(w * h * density);
      stars = [];
      for (let i = 0; i < n; i++) {
        stars.push({
          x: Math.floor(Math.random() * w),
          y: Math.floor(Math.random() * h),
          col: palette[Math.floor(Math.random() * palette.length)],
          phase: Math.random() * Math.PI * 2,
          big: Math.random() < 0.04,
        });
      }
    };

    // Throttle to 30fps. Twinkle is a slow `sin(t/700)` — there's no
    // perceptible quality loss vs 60fps, but we halve canvas work.
    const FRAME_MS = 1000 / 30;
    let last = 0;
    const draw = (t: number) => {
      if (t - last < FRAME_MS) {
        raf = requestAnimationFrame(draw);
        return;
      }
      last = t;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        const a = twinkle ? 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t / 700 + s.phase)) : 1;
        ctx.globalAlpha = a;
        ctx.fillStyle = s.col;
        if (s.big) {
          ctx.fillRect(s.x, s.y, 1, 1);
          ctx.fillRect(s.x - 1, s.y, 1, 1);
          ctx.fillRect(s.x + 1, s.y, 1, 1);
          ctx.fillRect(s.x, s.y - 1, 1, 1);
          ctx.fillRect(s.x, s.y + 1, 1, 1);
        } else {
          ctx.fillRect(s.x, s.y, 1, 1);
        }
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };

    const ro = new ResizeObserver(() => seed());
    ro.observe(canvas);
    seed();
    raf = requestAnimationFrame(draw);

    return () => {
      if (raf !== undefined) cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [density, twinkle, palette]);

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
        opacity,
        transition: "opacity 3s ease",
      }}
    />
  );
}

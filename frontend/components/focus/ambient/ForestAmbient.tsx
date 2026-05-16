"use client";

import { useEffect, useRef } from "react";

/**
 * 30 fireflies drift across the scene with a slow sinwave twinkle.
 * Canvas-based so we can animate many points without paying React
 * reconciliation costs per frame. Re-seeds on resize.
 */
export function ForestAmbient() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    interface Fly {
      x: number;
      y: number;
      dx: number;
      dy: number;
      phase: number;
    }
    let flies: Fly[] = [];
    let raf: number | undefined;

    const seed = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      flies = Array.from({ length: 30 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        dx: (Math.random() - 0.5) * 0.4,
        dy: (Math.random() - 0.5) * 0.4,
        phase: Math.random() * Math.PI * 2,
      }));
    };

    const draw = (t: number) => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      for (const f of flies) {
        f.x += f.dx;
        f.y += f.dy;
        if (f.x < 0 || f.x > w) f.dx *= -1;
        if (f.y < 0 || f.y > h) f.dy *= -1;
        ctx.globalAlpha = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t / 500 + f.phase));
        ctx.fillStyle = "#fef9c3";
        ctx.fillRect(Math.floor(f.x), Math.floor(f.y), 2, 2);
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
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      data-testid="ambient-forest"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        imageRendering: "pixelated",
        pointerEvents: "none",
      }}
    />
  );
}

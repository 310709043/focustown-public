"use client";

import { useEffect, useRef } from "react";

/**
 * 80 ember sparks drift upward with mild horizontal jitter, recycling
 * to the bottom when they leave the top. Colors come from a small
 * fire-palette so the swarm reads as ash + amber + ember reds.
 */
const COLORS = ["#fbbf24", "#fb923c", "#dc2626"];

export function FireAmbient() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    interface Spark {
      x: number;
      y: number;
      v: number;
      col: string;
    }
    let sparks: Spark[] = [];
    let raf: number | undefined;

    const seed = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      sparks = Array.from({ length: 80 }, () => ({
        x: Math.random() * canvas.width,
        y: canvas.height + Math.random() * 100,
        v: 0.4 + Math.random() * 1.2,
        col: COLORS[Math.floor(Math.random() * COLORS.length)],
      }));
    };

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      for (const s of sparks) {
        s.y -= s.v;
        s.x += (Math.random() - 0.5) * 0.6;
        if (s.y < -10) {
          s.y = h + 20;
          s.x = Math.random() * w;
        }
        ctx.fillStyle = s.col;
        ctx.fillRect(Math.floor(s.x), Math.floor(s.y), 2, 2);
      }
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
      data-testid="ambient-fire"
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

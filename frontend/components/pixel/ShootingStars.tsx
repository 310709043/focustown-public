"use client";

import { useEffect, useRef } from "react";

interface ShootingStarsProps {
  /** Soft cap on simultaneous shooting stars; new spawns wait. */
  maxAlive?: number;
  /** Random spawn interval bounds in milliseconds. */
  minSpawnMs?: number;
  maxSpawnMs?: number;
  color?: string;
  className?: string;
}

interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
}

/**
 * Sparse meteor streaks across the upper portion of the sky. Each shot
 * is spawned at a random interval, drifts diagonally with an 8-pixel
 * trailing fade, and disposes itself when its life counter exceeds max.
 * Renders nothing when the parent has zero height — safe to mount
 * unconditionally and let it idle on day/rain scenes.
 */
export function ShootingStars({
  maxAlive = 1,
  minSpawnMs = 2500,
  maxSpawnMs = 6500,
  color = "#fff",
  className,
}: ShootingStarsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let stars: Shot[] = [];
    let raf: number | undefined;
    let last = 0;

    const sync = () => {
      canvas.width = Math.max(1, canvas.clientWidth);
      canvas.height = Math.max(1, canvas.clientHeight);
    };

    const spawn = () => {
      if (stars.length >= maxAlive) return;
      const w = canvas.width;
      const h = canvas.height;
      stars.push({
        x: Math.random() * w * 0.8,
        y: Math.random() * h * 0.4,
        vx: 2 + Math.random() * 2,
        vy: 0.6 + Math.random() * 0.4,
        life: 0,
        max: 40 + Math.random() * 20,
      });
    };

    const tick = (t: number) => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (t - last > minSpawnMs + Math.random() * (maxSpawnMs - minSpawnMs)) {
        spawn();
        last = t;
      }

      for (let i = stars.length - 1; i >= 0; i--) {
        const s = stars[i];
        s.x += s.vx;
        s.y += s.vy;
        s.life += 1;
        if (s.life > s.max) {
          stars.splice(i, 1);
          continue;
        }
        for (let k = 0; k < 8; k++) {
          const a = 1 - k / 8;
          ctx.globalAlpha = a * (1 - s.life / s.max);
          ctx.fillStyle = color;
          ctx.fillRect(s.x - k * s.vx, s.y - k * s.vy, 1, 1);
        }
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(tick);
    };

    const ro = new ResizeObserver(() => sync());
    ro.observe(canvas);
    sync();
    raf = requestAnimationFrame(tick);

    return () => {
      if (raf !== undefined) cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [maxAlive, minSpawnMs, maxSpawnMs, color]);

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
      }}
    />
  );
}

"use client";

import { useEffect, useRef } from "react";

import type { CloudSpec } from "@/lib/data/sceneBackdrops";

/**
 * Single drifting cloud sprite for SceneBackdrop.
 *
 * The drift is a rAF loop that mutates `transform: translateX` directly on
 * the <img> ref — no React re-render per frame. `x` is the cloud's *stage*
 * x-coordinate (full stage width as reference, not the tier container, which
 * is only 16–32% wide — wrapping against it caused the cloud to "jump" back
 * mid-screen). translateX is then offset by the tier container's stage
 * position so the cloud truly enters from off-screen left and exits
 * off-screen right regardless of which tier (left, center, right) hosts it.
 * The breathing (opacity 0.7 ↔ 1.0) is a CSS @keyframes animation defined in
 * `app/globals.css` and gated by `prefers-reduced-motion: reduce`.
 */
const SPRITE_W = 220;

export function DriftCloud({ spec }: { spec: CloudSpec }) {
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const stage = imgRef.current?.closest(".scene-backdrop") as
      | HTMLElement
      | null;
    const tier = imgRef.current?.parentElement ?? null;

    let raf = 0;
    let x = -SPRITE_W;
    const tick = () => {
      x += spec.driftPxPerFrame;
      const stageW = stage?.clientWidth ?? window.innerWidth ?? 1280;
      if (x > stageW) x = -SPRITE_W;
      if (imgRef.current) {
        const stageLeft = stage?.getBoundingClientRect().left ?? 0;
        const tierLeft = tier?.getBoundingClientRect().left ?? stageLeft;
        const offset = tierLeft - stageLeft;
        imgRef.current.style.transform = `translateX(${x - offset}px)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spec.driftPxPerFrame]);

  return (
    <div className={`scene-cloud-tier scene-cloud-tier-${spec.tier}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={spec.src}
        alt=""
        aria-hidden
        className="scene-cloud-sprite"
        style={{ animationDelay: `${spec.breathDelaySec}s` }}
        loading="eager"
        decoding="async"
      />
    </div>
  );
}

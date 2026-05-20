"use client";

import { useEffect, useRef } from "react";

import type { CloudSpec } from "@/lib/data/sceneBackdrops";

/**
 * Single drifting cloud sprite for SceneBackdrop.
 *
 * The drift is a rAF loop that mutates `transform: translateX` directly on
 * the <img> ref — no React re-render per frame. Wraps horizontally when
 * the sprite leaves the right edge of its tier container. The breathing
 * (opacity 0.7 ↔ 1.0) is a CSS @keyframes animation defined in
 * `app/globals.css` and gated by `prefers-reduced-motion: reduce`.
 */
export function DriftCloud({ spec }: { spec: CloudSpec }) {
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    let raf = 0;
    let x = 0;
    const tick = () => {
      x += spec.driftPxPerFrame;
      if (imgRef.current) {
        // Wrap at +180px past the right edge of the parent so the sprite
        // re-enters from the left without a visible pop. The parent is
        // each `.tier-*` container which spans the full stage width.
        const parentWidth = imgRef.current.parentElement?.clientWidth ?? 1106;
        const wrap = parentWidth + 180;
        const wrapped = ((x % wrap) + wrap) % wrap;
        imgRef.current.style.transform = `translateX(${wrapped - 90}px)`;
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

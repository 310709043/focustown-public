"use client";

import { useEffect, useRef, useState } from "react";

import { useSceneStore } from "@/lib/state/sceneStore";
import type { SceneName } from "@/lib/state/sceneStore";

/**
 * Soft drifting cloud overlay — Phase 1.E swap to sprite-based clouds.
 *
 * Pre-rebrand this component rendered a single inline char-grid via
 * PixelSprite (one shape, one palette), gated to `scene === "cloudy"` only.
 * Now it picks PNG sprites from the 801184 pack (8 shapes × 5 sizes × 2
 * palettes, committed under `public/assets/v6/clouds/`) and mounts for
 * EVERY scene per docs/qa/canonical-reference-index.md § 1.1 layers 25 +
 * 35 — clouds are an ambient layer, not a weather flag.
 *
 * Palette selection by scene mood:
 *   day / dawn / dusk / cloudy     → gray (light fluffy)
 *   night / midnight / rain / snow / storm → black (silhouette)
 *
 * Density tier:
 *   cloudy             → 5 clouds (dense)
 *   day / dusk / dawn / rain / snow → 3 clouds (moderate)
 *   night / midnight   → 2 clouds (sparse, mostly empty sky)
 *   storm              → 4 clouds (dense + dark)
 *
 * Per-cloud spec is deterministic (fixed seed table) so SSR + CSR markup
 * matches without `useId` overhead.
 *
 * Performance: ref-based DOM mutation for cloud drift, not React state.
 * Each frame mutates `style.left` directly to avoid re-renders.
 */

type CloudSpec = {
  readonly id: number;
  readonly y: number; // top px
  readonly speed: number; // px/frame drift
  readonly shape: number; // 1..8
  readonly size: number; // 1..5 (1 = largest, 5 = smallest)
};

// Fixed pool of 6 cloud slots; the per-scene density picks the first N.
// Y-positions span the upper ~40% of viewport so they don't overlap the
// city skyline (CityBackground's mid-layer detail starts around y≈250).
const CLOUD_POOL: readonly CloudSpec[] = [
  { id: 0, y: 28,  speed: 0.18, shape: 1, size: 2 },
  { id: 1, y: 76,  speed: 0.24, shape: 3, size: 3 },
  { id: 2, y: 120, speed: 0.16, shape: 5, size: 2 },
  { id: 3, y: 52,  speed: 0.30, shape: 7, size: 3 },
  { id: 4, y: 160, speed: 0.20, shape: 2, size: 3 },
  { id: 5, y: 95,  speed: 0.22, shape: 4, size: 4 },
];

const START_XS: readonly number[] = [-80, 60, 220, 420, 640, 820];

const PALETTE_BY_SCENE: Record<SceneName, "gray" | "black"> = {
  day: "gray",
  dawn: "gray",
  dusk: "gray",
  cloudy: "gray",
  night: "black",
  midnight: "black",
  rain: "black",
  snow: "black",
  storm: "black",
};

const DENSITY_BY_SCENE: Record<SceneName, number> = {
  cloudy: 5,
  storm: 4,
  day: 3,
  dawn: 3,
  dusk: 3,
  rain: 3,
  snow: 3,
  night: 2,
  midnight: 2,
};

// Per-scene opacity — Phase 3.4 polish: bumped night/midnight up from
// 0.45/0.35 because the dark Clouds_black silhouettes were under-reading
// against the calm-indigo CityBackground at night. Day-time stays bright;
// stormy stays mid because the storm-overlay separately darkens the sky.
const OPACITY_BY_SCENE: Record<SceneName, number> = {
  day: 0.85,
  dawn: 0.78,
  dusk: 0.72,
  cloudy: 0.88,
  night: 0.62,
  midnight: 0.52,
  rain: 0.60,
  snow: 0.70,
  storm: 0.72,
};

function spriteUrl(palette: "gray" | "black", shape: number, size: number): string {
  // 801184 quirk: shapes 1-7 use `cloud_` (singular) filename prefix, but
  // shape 8 uses `clouds_` (plural) per the Craftpix asset naming. Phase 1.A
  // fix commit added Shape8 with the alternate prefix; we mirror it here.
  const prefix = shape === 8 ? "clouds" : "cloud";
  return `/assets/v6/clouds/${palette}/${prefix}_shape${shape}_${size}.png`;
}

export function Clouds() {
  const scene = useSceneStore((s) => s.current);
  const density = DENSITY_BY_SCENE[scene];
  const palette = PALETTE_BY_SCENE[scene];
  const opacity = OPACITY_BY_SCENE[scene];
  const activeClouds = CLOUD_POOL.slice(0, density);

  const imgRefs = useRef<(HTMLImageElement | null)[]>([]);
  const posRef = useRef<number[]>(START_XS.slice(0, density));
  const [width, setWidth] = useState(0);

  // Reset positions when density changes (scene change).
  useEffect(() => {
    posRef.current = START_XS.slice(0, density);
  }, [density]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setWidth(window.innerWidth);
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (width === 0) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    let raf = 0;
    const tick = () => {
      for (let i = 0; i < activeClouds.length; i++) {
        let np = posRef.current[i] + activeClouds[i].speed;
        if (np > width + 200) np = -200;
        posRef.current[i] = np;
        const el = imgRefs.current[i];
        if (el) el.style.left = `${np}px`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [width, activeClouds]);

  return (
    <div
      data-testid="clouds-overlay"
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 2,
        opacity,
      }}
    >
      {activeClouds.map((c, i) => (
        // Plain <img>: next/image's optimizer re-encodes and breaks
        // `image-rendering: pixelated` for the cloud sprite.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={c.id}
          ref={(el) => { imgRefs.current[i] = el; }}
          src={spriteUrl(palette, c.shape, c.size)}
          alt=""
          width={220}
          height={110}
          style={{
            position: "absolute",
            left: posRef.current[i],
            top: c.y,
            imageRendering: "pixelated",
          }}
          loading="eager"
          decoding="async"
        />
      ))}
    </div>
  );
}

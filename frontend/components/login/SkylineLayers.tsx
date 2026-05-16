"use client";

import { useEffect, useRef } from "react";

import {
  drawSkyline,
  shadeHex,
  SKYLINE_PALETTES,
} from "@/lib/pixel/skyline";

interface SkylineLayersProps {
  /** Reference's `direction` knob. Defaults to "neon" — the only direction
   *  currently wired in this branch; dusk/rain palettes ride along for
   *  later theme toggling. */
  direction?: keyof typeof SKYLINE_PALETTES;
}

/**
 * Three procedurally drawn city silhouettes stacked back-to-front.
 * Reference uses seeds 7 / 22 / 41 with descending body brightness to
 * imply depth-of-field — kept verbatim so the parallax reads identically.
 *
 * Re-renders on viewport width changes via ResizeObserver. The canvases
 * are absolutely positioned within the parent so the parent must be
 * `position: relative` (LoginScene satisfies this).
 */
export function SkylineLayers({ direction = "neon" }: SkylineLayersProps) {
  const farthestRef = useRef<HTMLCanvasElement>(null);
  const farRef = useRef<HTMLCanvasElement>(null);
  const nearRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const palette = SKYLINE_PALETTES[direction];

    const paint = () => {
      const w = window.innerWidth;
      if (farthestRef.current) {
        drawSkyline(farthestRef.current, {
          width: w,
          height: 110,
          seed: 41,
          layer: "bg",
          palette: { ...palette, body: shadeHex(palette.body, 0.55) },
        });
      }
      if (farRef.current) {
        drawSkyline(farRef.current, {
          width: w,
          height: 150,
          seed: 22,
          layer: "bg",
          palette: { ...palette, body: shadeHex(palette.body, 0.7) },
        });
      }
      if (nearRef.current) {
        drawSkyline(nearRef.current, {
          width: w,
          height: 230,
          seed: 7,
          palette,
        });
      }
    };

    paint();
    window.addEventListener("resize", paint);
    return () => window.removeEventListener("resize", paint);
  }, [direction]);

  return (
    <>
      <canvas
        ref={farthestRef}
        aria-hidden
        className="pointer-events-none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 280,
          width: "100%",
          height: 110,
          imageRendering: "pixelated",
          opacity: 0.4,
        }}
      />
      <canvas
        ref={farRef}
        aria-hidden
        className="pointer-events-none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 200,
          width: "100%",
          height: 150,
          imageRendering: "pixelated",
          opacity: 0.55,
        }}
      />
      <canvas
        ref={nearRef}
        aria-hidden
        className="pointer-events-none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 80,
          width: "100%",
          height: 230,
          imageRendering: "pixelated",
        }}
      />
    </>
  );
}

"use client";

import { PixelSprite } from "@/components/pixel/PixelSprite";

const CLOUD_SPRITE = `
....CCCCCCC....
..CCCCCCCCCCC..
.CCCCCCCCCCCC.
CCCCCCCCCCCCCC
.CCCCCCCCCCCC.
`;

/**
 * Five pixel clouds drift left → right across the scene with staggered
 * delays. Pure CSS keyframe so reduced-motion users see them stop
 * cleanly. Sprite reused as a single instance (`PixelSprite` caches its
 * data URL).
 */
export function LofiAmbient() {
  return (
    <div
      aria-hidden
      data-testid="ambient-lofi"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: 20 + i * 80,
            left: -100,
            opacity: 0.3,
            animation: "lofiDrift 30s linear infinite",
            animationDelay: `${i * 4}s`,
          }}
        >
          <PixelSprite sprite={CLOUD_SPRITE} palette={{ C: "#a78bfa" }} scale={3} />
        </div>
      ))}
      <style>{`
        @keyframes lofiDrift {
          from { transform: translateX(0); }
          to   { transform: translateX(120vw); }
        }
      `}</style>
    </div>
  );
}

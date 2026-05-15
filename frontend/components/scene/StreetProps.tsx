"use client";

import { PixelSprite } from "@/components/pixel/PixelSprite";
import { BENCH, LAMP, TREE } from "@/lib/pixel/sprites/world";

/**
 * Sidewalk furniture — lamps, trees, benches. Positions are evenly
 * spaced so the row reads as "a city street" rather than randomly
 * scattered. Props are static; the moving things (pedestrians, cars,
 * dogs, birds) are now per-user entities rendered by their own
 * components, so this file no longer owns any animation state.
 */

const LAMP_XS = [3, 13, 23, 33, 43, 53, 63, 73, 83, 93];
const TREE_XS = [8, 22, 36, 50, 64, 78, 92];
const BENCH_XS = [18, 48, 78];

export function StreetProps() {
  return (
    <div
      className="absolute left-0 right-0 pointer-events-none z-[3]"
      style={{ bottom: 24, height: 90 }}
      aria-hidden
    >
      {LAMP_XS.map((x) => (
        <span
          key={`lamp-${x}`}
          className="absolute"
          style={{ left: `${x}%`, bottom: 30, transform: "translateX(-50%)" }}
        >
          <PixelSprite sprite={LAMP.sprite} palette={LAMP.palette} scale={3} glow="#fcd34d" />
        </span>
      ))}
      {TREE_XS.map((x) => (
        <span
          key={`tree-${x}`}
          className="absolute"
          style={{ left: `${x}%`, bottom: 26, transform: "translateX(-50%)" }}
        >
          <PixelSprite sprite={TREE.sprite} palette={TREE.palette} scale={3} />
        </span>
      ))}
      {BENCH_XS.map((x) => (
        <span
          key={`bench-${x}`}
          className="absolute"
          style={{ left: `${x}%`, bottom: 18, transform: "translateX(-50%)" }}
        >
          <PixelSprite sprite={BENCH.sprite} palette={BENCH.palette} scale={3} />
        </span>
      ))}
    </div>
  );
}

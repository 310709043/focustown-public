"use client";

import { useEffect, useState } from "react";

import { AnimatedSprite } from "@/components/pixel/AnimatedSprite";
import { PixelSprite } from "@/components/pixel/PixelSprite";
import { BENCH, CAT_WALK, LAMP, TREE } from "@/lib/pixel/sprites/world";

/**
 * Sidewalk furniture — lamps, trees, benches, and a wandering cat.
 * Positions are evenly spaced so the row reads as "a city street"
 * rather than randomly scattered. The cat strolls back and forth
 * via a wrapped percentage offset; props are static.
 *
 * Lives below pedestrians/cars in z-order so the moving things
 * occlude the static furniture, which matches the reference's depth.
 */

const LAMP_XS = [3, 13, 23, 33, 43, 53, 63, 73, 83, 93];
const TREE_XS = [8, 22, 36, 50, 64, 78, 92];
const BENCH_XS = [18, 48, 78];

const CAT_SPEED = 0.04; // % per frame

export function StreetProps() {
  const [catX, setCatX] = useState(10);
  const [catFlip, setCatFlip] = useState(false);

  useEffect(() => {
    let raf: number | undefined;
    let lastX = 10;
    let dir = 1;

    const tick = () => {
      lastX += dir * CAT_SPEED;
      if (lastX > 92) {
        dir = -1;
        setCatFlip(true);
      } else if (lastX < 4) {
        dir = 1;
        setCatFlip(false);
      }
      setCatX(lastX);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf !== undefined) cancelAnimationFrame(raf);
    };
  }, []);

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
      <span
        className="absolute"
        style={{ left: `${catX}%`, bottom: 20, transform: "translateX(-50%)" }}
      >
        <AnimatedSprite
          frames={CAT_WALK.frames}
          palette={CAT_WALK.palette}
          fps={3}
          scale={2}
          flip={catFlip}
        />
      </span>
    </div>
  );
}

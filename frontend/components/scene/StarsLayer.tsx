"use client";

import { useMemo } from "react";
import { useSceneStore } from "@/lib/state/sceneStore";
import { SCENES } from "@/lib/data/scenes";

const STAR_COUNT = 100;

export function StarsLayer() {
  const current = useSceneStore((s) => s.current);
  const opacity = SCENES[current].stars;
  const stars = useMemo(
    () =>
      Array.from({ length: STAR_COUNT }, () => ({
        size: Math.random() < 0.2 ? 2 : 1,
        top: Math.random() * 68,
        left: Math.random() * 100,
        dur: 1.2 + Math.random() * 4,
        delay: Math.random() * 5,
      })),
    [],
  );

  return (
    <div
      className="absolute inset-0 pointer-events-none transition-opacity duration-[3s]"
      style={{ opacity }}
    >
      {stars.map((s, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white animate-twinkle"
          style={
            {
              width: s.size,
              height: s.size,
              top: `${s.top}%`,
              left: `${s.left}%`,
              ["--d" as string]: `${s.dur}s`,
              ["--dl" as string]: `-${s.delay}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

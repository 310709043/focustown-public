"use client";

import { useSceneStore } from "@/lib/state/sceneStore";
import { SCENES } from "@/lib/data/scenes";

export function Sky() {
  const current = useSceneStore((s) => s.current);
  const scene = SCENES[current];
  return (
    <div
      className="absolute inset-0 transition-[background] duration-[4s]"
      style={{ background: scene.sky }}
    />
  );
}

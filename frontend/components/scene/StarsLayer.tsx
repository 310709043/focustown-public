"use client";

import { StarField } from "@/components/pixel/StarField";
import { SCENES } from "@/lib/data/scenes";
import { useSceneStore } from "@/lib/state/sceneStore";

/**
 * Top-of-sky starfield. Drives density via the active scene's `stars`
 * field — a scene with stars=0 returns null so we don't burn rAF cycles
 * during sunny scenes. The canvas-based StarField does the rendering.
 */
export function StarsLayer() {
  const current = useSceneStore((s) => s.current);
  const opacity = SCENES[current].stars;

  if (opacity <= 0) return null;

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ height: "68%" }}
    >
      <StarField opacity={opacity} density={0.0015} />
    </div>
  );
}

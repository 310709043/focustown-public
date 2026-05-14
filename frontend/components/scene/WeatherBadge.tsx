"use client";

import { SCENES } from "@/lib/data/scenes";
import { useSceneStore } from "@/lib/state/sceneStore";

/**
 * Top-left atmospheric badge: shows the current scene's emoji-label
 * (e.g. "🌙 夜晚・微涼 18°C"). Sits in a chunky `.pixel-panel` shell
 * so it reads as a fixed UI artefact rather than a translucent chip.
 */
export function WeatherBadge() {
  const current = useSceneStore((s) => s.current);
  return (
    <div
      className="pixel-panel absolute top-[12px] left-[14px] px-3 py-1.5 z-[6] transition-all duration-1000 font-japan"
      style={{ fontSize: 12, letterSpacing: 1 }}
    >
      {SCENES[current].label}
    </div>
  );
}

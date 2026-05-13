"use client";

import { useSceneStore } from "@/lib/state/sceneStore";
import { SCENES } from "@/lib/data/scenes";

export function WeatherBadge() {
  const current = useSceneStore((s) => s.current);
  return (
    <div
      className="absolute top-[10px] left-[12px] px-2.5 py-1 rounded-full bg-glass border border-border text-[10px] z-[6] backdrop-blur-md transition-all duration-1000"
    >
      {SCENES[current].label}
    </div>
  );
}

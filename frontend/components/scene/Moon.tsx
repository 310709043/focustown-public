"use client";

import { useSceneStore } from "@/lib/state/sceneStore";
import { SCENES } from "@/lib/data/scenes";

export function Moon() {
  const current = useSceneStore((s) => s.current);
  const op = SCENES[current].moon;
  return (
    <div
      className="absolute top-[18px] right-[60px] transition-opacity duration-[3s] z-[2]"
      style={{ opacity: op }}
    >
      <div
        className="w-12 h-12 rounded-full animate-moonPulse"
        style={{
          background: "radial-gradient(circle at 33% 28%,#fffbeb,#fef3c7,#fcd34d)",
        }}
      />
    </div>
  );
}

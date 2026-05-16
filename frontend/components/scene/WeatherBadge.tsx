"use client";

import { useTranslations } from "next-intl";

import { useSceneStore, type SceneName } from "@/lib/state/sceneStore";

// Visual constants stay co-located with the badge — they describe how the scene
// is presented in the UI rather than the scene's logical identity, which lives
// in lib/data/scenes.ts. Translation of the scene name + atmospheric condition
// is delegated to the `scenes` namespace so adding a language is a JSON edit.
const SCENE_EMOJI: Record<SceneName, string> = {
  night: "🌙",
  midnight: "🌙",
  dawn: "🌅",
  day: "☀️",
  dusk: "🌇",
  cloudy: "☁️",
  rain: "🌧",
  snow: "❄️",
  storm: "⛈",
};

// Aligned with reference/screen-town.jsx TIME_TEMP: dawn 12 · day 22 · dusk 19
// · night 16 · midnight 11. Weather-collapsed scenes inherit the implied time.
const SCENE_TEMP_C: Record<SceneName, number> = {
  night: 16,
  midnight: 11,
  dawn: 12,
  day: 22,
  dusk: 19,
  cloudy: 18,
  rain: 16,
  snow: 2,
  storm: 12,
};

/**
 * Top-left atmospheric badge: shows the current scene's emoji-label
 * (e.g. "🌙 夜晚・微涼 18°C"). Sits in a chunky `.pixel-panel` shell
 * so it reads as a fixed UI artefact rather than a translucent chip.
 */
export function WeatherBadge() {
  const current = useSceneStore((s) => s.current);
  const t = useTranslations("scenes");

  const emoji = SCENE_EMOJI[current];
  const name = t(`${current}.name`);
  const condition = t(`${current}.condition`);
  const temp = SCENE_TEMP_C[current];

  return (
    <div
      className="pixel-panel absolute top-[12px] left-[14px] px-3 py-1.5 z-[6] transition-all duration-1000 font-japan"
      style={{ fontSize: "var(--font-size-caption)", letterSpacing: 1 }}
    >
      {emoji} {name}・{condition} {temp}°C
    </div>
  );
}

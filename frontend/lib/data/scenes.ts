import type { SceneName } from "../state/sceneStore";

/**
 * Era B refined palette (locked 2026-05-20 per
 * docs/qa/canonical-reference-index.md § 0).
 *
 * Vocabulary used across all 9 scenes — no neon, no purple-magenta drift:
 *   peach   #e9a76e   warm primary accent
 *   rose    #c98aa3   secondary accent
 *   slate   #91a8c4   tertiary cool accent
 *   cream   #f4d289   highlight (sun, window-warm)
 *   ink     #f4ecd8   warm cream "white"
 *   indigo  #0f1426 → #16203c → #1f2a4d   bg ladder
 *   sky     #15203d → #2a3a64 → #4d5e88   night-sky ladder
 *
 * Each scene picks values from this vocabulary instead of inventing fresh
 * hex. The pre-rebrand neon palette (#0d1040, #4c1d95, #ea580c, etc.) is
 * archived; bumping any value here without updating the canonical doc is a
 * regression and should be caught by visual diff in Phase 3.
 */

export type SceneDef = {
  sky: string;
  ground: string;
  road: string;
  sidewalk: string;
  stars: number;
  aurora: number;
  moon: number;
  sun: number;
  label: string;
};

export const SCENES: Record<SceneName, SceneDef> = {
  night: {
    sky:
      "linear-gradient(180deg,#0f1426 0%,#15203d 30%,#2a3a64 65%,#4d5e88 100%)",
    ground: "#1a2138",
    road: "#1f2742",
    sidewalk: "#252b48",
    stars: 1,
    aurora: 0.1,
    moon: 1,
    sun: 0,
    label: "🌙 夜晚・微涼 16°C",
  },
  midnight: {
    sky:
      "linear-gradient(180deg,#0a0e1e 0%,#0f1426 50%,#15203d 100%)",
    ground: "#0a0e1e",
    road: "#0d121f",
    sidewalk: "#101521",
    stars: 1,
    aurora: 0.18,
    moon: 1,
    sun: 0,
    label: "🌙 深夜・寂靜 11°C",
  },
  dawn: {
    sky:
      "linear-gradient(180deg,#3d2848 0%,#7b5a7a 25%,#c98aa3 50%,#e9a76e 75%,#f4d289 100%)",
    ground: "#2a2238",
    road: "#322a42",
    sidewalk: "#3a324a",
    stars: 0.12,
    aurora: 0,
    moon: 0,
    sun: 0,
    label: "🌅 黎明・薄霧 12°C",
  },
  day: {
    sky:
      "linear-gradient(180deg,#4d5e88 0%,#91a8c4 30%,#b8c4d8 60%,#d8e4f0 85%,#f4ecd8 100%)",
    ground: "#3d4b6a",
    road: "#4a5878",
    sidewalk: "#566586",
    stars: 0,
    aurora: 0,
    moon: 0,
    sun: 1,
    label: "☀️ 白天・晴朗 22°C",
  },
  dusk: {
    sky:
      "linear-gradient(180deg,#1f2a4d 0%,#3d3858 25%,#91a8c4 45%,#c98aa3 65%,#e9a76e 85%,#f4d289 100%)",
    ground: "#1f2238",
    road: "#262a42",
    sidewalk: "#2c324a",
    stars: 0.35,
    aurora: 0,
    moon: 0,
    sun: 0,
    label: "🌇 黃昏・涼爽 19°C",
  },
  cloudy: {
    sky:
      "linear-gradient(180deg,#3a4257 0%,#5a6479 45%,#8c95a8 100%)",
    ground: "#2a3142",
    road: "#303749",
    sidewalk: "#363d50",
    stars: 0,
    aurora: 0,
    moon: 0,
    sun: 0.3,
    label: "☁️ 多雲・微涼 18°C",
  },
  rain: {
    sky:
      "linear-gradient(180deg,#0f1426 0%,#15203d 45%,#2a3a64 100%)",
    ground: "#15203d",
    road: "#1a2542",
    sidewalk: "#1f2a48",
    stars: 0,
    aurora: 0,
    moon: 0,
    sun: 0,
    label: "🌧 下雨・潮濕 16°C",
  },
  snow: {
    sky:
      "linear-gradient(180deg,#1a2138 0%,#2a3a64 45%,#4d5e88 100%)",
    ground: "#252b48",
    road: "#2c3252",
    sidewalk: "#333a5c",
    stars: 0.92,
    aurora: 0.28,
    moon: 1,
    sun: 0,
    label: "❄️ 下雪・靜謐 2°C",
  },
  storm: {
    sky:
      "linear-gradient(180deg,#0a0e1e 0%,#0f1426 45%,#15203d 100%)",
    ground: "#0a0e1e",
    road: "#0d121f",
    sidewalk: "#101521",
    stars: 0,
    aurora: 0,
    moon: 0,
    sun: 0,
    label: "⛈ 暴風雨・危險 12°C",
  },
};

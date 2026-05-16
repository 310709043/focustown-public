import type { SceneName } from "../state/sceneStore";

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
      "linear-gradient(180deg,#020109 0%,#06011a 25%,#0c0330 50%,#160845 70%,#0d1040 100%)",
    ground: "#030111",
    road: "#060118",
    sidewalk: "#08021e",
    stars: 1,
    aurora: 0.18,
    moon: 1,
    sun: 0,
    label: "🌙 夜晚・微涼 16°C",
  },
  midnight: {
    sky:
      "linear-gradient(180deg,#020208 0%,#0a0820 50%,#15093a 100%)",
    ground: "#020108",
    road: "#040114",
    sidewalk: "#06021a",
    stars: 1,
    aurora: 0.22,
    moon: 1,
    sun: 0,
    label: "🌙 深夜・寂靜 11°C",
  },
  dawn: {
    sky:
      "linear-gradient(180deg,#0d0428 0%,#4c1d95 25%,#9d174d 50%,#ea580c 75%,#fcd34d 100%)",
    ground: "#100c1a",
    road: "#140e20",
    sidewalk: "#180e26",
    stars: 0.12,
    aurora: 0,
    moon: 0,
    sun: 0,
    label: "🌅 黎明・薄霧 12°C",
  },
  day: {
    sky:
      "linear-gradient(180deg,#0c4a6e 0%,#0ea5e9 35%,#7dd3fc 65%,#e0f2fe 100%)",
    ground: "#151020",
    road: "#1a1428",
    sidewalk: "#1e1830",
    stars: 0,
    aurora: 0,
    moon: 0,
    sun: 1,
    label: "☀️ 白天・晴朗 22°C",
  },
  dusk: {
    sky:
      "linear-gradient(180deg,#1e1040 0%,#7c2d12 30%,#c2410c 55%,#f97316 75%,#fcd34d 100%)",
    ground: "#0d0a14",
    road: "#100c18",
    sidewalk: "#140e1e",
    stars: 0.35,
    aurora: 0,
    moon: 0,
    sun: 0,
    label: "🌇 黃昏・涼爽 19°C",
  },
  cloudy: {
    sky:
      "linear-gradient(180deg,#3a3a52 0%,#5c5c75 45%,#8a8aa0 100%)",
    ground: "#1a1828",
    road: "#1e1c2c",
    sidewalk: "#222033",
    stars: 0,
    aurora: 0,
    moon: 0,
    sun: 0.3,
    label: "☁️ 多雲・微涼 18°C",
  },
  rain: {
    sky: "linear-gradient(180deg,#0a0a16 0%,#111828 45%,#1e2940 100%)",
    ground: "#060510",
    road: "#08071a",
    sidewalk: "#0a081c",
    stars: 0,
    aurora: 0,
    moon: 0,
    sun: 0,
    label: "🌧 下雨・潮濕 16°C",
  },
  snow: {
    sky: "linear-gradient(180deg,#0a0a1a 0%,#111135 45%,#1a1a42 100%)",
    ground: "#0e0e1c",
    road: "#121222",
    sidewalk: "#141428",
    stars: 0.92,
    aurora: 0.28,
    moon: 1,
    sun: 0,
    label: "❄️ 下雪・靜謐 2°C",
  },
  storm: {
    sky: "linear-gradient(180deg,#040408 0%,#0a0a14 45%,#10101e 100%)",
    ground: "#040408",
    road: "#060610",
    sidewalk: "#080810",
    stars: 0,
    aurora: 0,
    moon: 0,
    sun: 0,
    label: "⛈ 暴風雨・危險 12°C",
  },
};

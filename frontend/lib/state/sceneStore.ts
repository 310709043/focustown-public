"use client";

import { create } from "zustand";

export type SceneName =
  | "night"
  | "midnight"
  | "dawn"
  | "day"
  | "dusk"
  | "cloudy"
  | "rain"
  | "snow"
  | "storm";

// Auto-rotation cadence: one scene every 10 minutes. The follow.mp4
// reference compresses a whole day-night cycle into ~22s for demo only;
// in the live app we want each scene to dwell long enough that returning
// users see meaningful variety without the sky flickering past them.
export const SCENE_TICK_MS = 10 * 60_000;

export const SCENE_ORDER: SceneName[] = [
  "night",
  "midnight",
  "dawn",
  "day",
  "cloudy",
  "dusk",
  "rain",
  "night",
  "snow",
  "night",
  "storm",
  "dusk",
];

interface SceneState {
  current: SceneName;
  orderIdx: number;
  setScene: (s: SceneName) => void;
  advance: () => void;
}

export const useSceneStore = create<SceneState>((set, get) => ({
  current: "night",
  orderIdx: 0,
  setScene(s) {
    set({ current: s });
  },
  advance() {
    const next = (get().orderIdx + 1) % SCENE_ORDER.length;
    set({ orderIdx: next, current: SCENE_ORDER[next] });
  },
}));

if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  // Dev-only: lets Playwright / browser devtools force-set scenes during
  // visual diff against reference frames. Stripped at build time when
  // NODE_ENV === "production".
  (window as unknown as { __sceneStore?: typeof useSceneStore }).__sceneStore =
    useSceneStore;
}

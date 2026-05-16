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

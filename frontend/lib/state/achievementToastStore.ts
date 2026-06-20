"use client";

import { create } from "zustand";

interface AchievementToastItem {
  id: string;
  name: string;
  icon: string;
}

interface AchievementToastState {
  queue: AchievementToastItem[];
  push: (item: AchievementToastItem) => void;
  shift: () => void;
}

export const useAchievementToastStore = create<AchievementToastState>((set) => ({
  queue: [],
  push: (item) => set((s) => ({ queue: [...s.queue, item] })),
  shift: () => set((s) => ({ queue: s.queue.slice(1) })),
}));

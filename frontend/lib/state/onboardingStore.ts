"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * First-time onboarding tour state.
 *
 * Tour walks new pilots through the three focus modes (City / Solo /
 * Together) plus where the Timer + Music live on the Town page.
 *
 * `completed` is persisted to localStorage so the tour only auto-fires
 * once per browser. ProfileModal exposes a "Replay tutorial" row that
 * calls `restart()` to re-open it on demand.
 */

export const ONBOARDING_TOTAL_STEPS = 5;

export type OnboardingStepIndex = 0 | 1 | 2 | 3 | 4;

interface OnboardingState {
  /** True once the user finished or skipped the tour. Persisted. */
  completed: boolean;
  /** True while the tour is actively rendered. Not persisted. */
  active: boolean;
  /** 0-indexed step within the tour. */
  currentStep: OnboardingStepIndex;
  /**
   * True once zustand's persist middleware has finished reading from
   * localStorage. Consumers gate the auto-fire on this so a returning
   * user (whose persisted `completed: true` lands a tick after first
   * render) never sees the welcome bubble flash.
   */
  hasHydrated: boolean;
  start: () => void;
  next: () => void;
  back: () => void;
  skip: () => void;
  complete: () => void;
  restart: () => void;
  setHydrated: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      completed: false,
      active: false,
      currentStep: 0,
      hasHydrated: false,

      start() {
        set({ active: true, currentStep: 0 });
      },

      next() {
        const idx = get().currentStep;
        if (idx >= ONBOARDING_TOTAL_STEPS - 1) {
          set({ active: false, completed: true, currentStep: 0 });
          return;
        }
        set({ currentStep: (idx + 1) as OnboardingStepIndex });
      },

      back() {
        const idx = get().currentStep;
        if (idx <= 0) return;
        set({ currentStep: (idx - 1) as OnboardingStepIndex });
      },

      skip() {
        set({ active: false, completed: true, currentStep: 0 });
      },

      complete() {
        set({ active: false, completed: true, currentStep: 0 });
      },

      restart() {
        set({ active: true, completed: false, currentStep: 0 });
      },

      setHydrated() {
        set({ hasHydrated: true });
      },
    }),
    {
      name: "lbt.onboarding.v1",
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") {
          return {
            getItem: () => null,
            setItem: () => undefined,
            removeItem: () => undefined,
          };
        }
        return window.localStorage;
      }),
      // Only persist whether the tour has been completed — the live
      // `active` and `currentStep` are session-scoped UI state.
      partialize: (s) => ({ completed: s.completed }),
      version: 1,
      // Fires once localStorage has been read and the persisted slice
      // has been merged into the live state. OnboardingTour gates its
      // auto-fire on `hasHydrated` so it never reads a stale default.
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);

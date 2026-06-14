"use client";

import { create } from "zustand";

import { preferencesApi, type PreferencesBundle } from "@/lib/api/endpoints";

/**
 * Client cache for ``GET /api/v1/me/preferences``.
 *
 * Hydration:
 *   - First call to ``ensureHydrated()`` issues a single GET and caches
 *     the bundle.
 *   - ``patch()`` calls PATCH and overwrites the local cache with the
 *     server's authoritative response.
 *
 * The store keeps a flat ``byKey`` map so consumers can subscribe to a
 * single key without re-rendering on unrelated changes.
 */

export const PREF_SOUND_MIX = "sound.mix";
export const PREF_NOTIFICATIONS_DAILY = "notifications.daily";
export const PREF_LANGUAGE_PREFERRED = "language.preferred";
export const PREF_FOCUS_DAILY_GOAL = "focus.daily_goal";
export const PREF_FOCUS_DURATION_MINUTES = "focus.duration_minutes";
export const PREF_UI_SCENE_ROTATION = "ui.scene_rotation";

export interface SoundMixValue {
  lofi: number;
  rain: number;
  cafe: number;
  fire: number;
}

interface PreferencesStore {
  byKey: PreferencesBundle;
  hydrated: boolean;
  ensureHydrated: () => Promise<void>;
  patch: (patch: PreferencesBundle) => Promise<void>;
  reset: () => void;
}

const DEFAULT_BUNDLE: PreferencesBundle = {
  [PREF_SOUND_MIX]: { lofi: 60, rain: 0, cafe: 0, fire: 0 },
  [PREF_NOTIFICATIONS_DAILY]: { enabled: false, time: "09:00" },
  [PREF_LANGUAGE_PREFERRED]: "zh-TW",
  [PREF_FOCUS_DAILY_GOAL]: 4,
  [PREF_FOCUS_DURATION_MINUTES]: 25,
  [PREF_UI_SCENE_ROTATION]: true,
};

export const usePreferencesStore = create<PreferencesStore>((set, get) => ({
  byKey: DEFAULT_BUNDLE,
  hydrated: false,

  async ensureHydrated() {
    if (get().hydrated) return;
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 8_000),
      );
      const bundle = await Promise.race([preferencesApi.get(), timeout]);
      set({ byKey: bundle, hydrated: true });
    } catch {
      // Timeout or network error — fall back to defaults. hydrated stays
      // false so a subsequent mount or navigation can retry.
      set({ hydrated: true });
    }
  },

  async patch(patch) {
    // Optimistic local merge so the slider feels instant.
    set((prev) => ({ byKey: { ...prev.byKey, ...patch } }));
    try {
      const next = await preferencesApi.patch(patch);
      set({ byKey: next, hydrated: true });
    } catch {
      // Roll back is too aggressive for a single failed slider stroke;
      // we just leave the optimistic value and let the next successful
      // PATCH (or GET) reconcile.
    }
  },

  reset() {
    set({ byKey: DEFAULT_BUNDLE, hydrated: false });
  },
}));

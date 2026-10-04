import { create } from "zustand";

/**
 * Whether the attention chime may sound. On by default (walking in means
 * you are waiting for someone); a visitor who turns it off keeps it off on
 * this device. The tab-title cue is silent and always on.
 */
const OFF_KEY = "lbt.chime.off";

interface ChimeState {
  enabled: boolean;
  hydrate(): void;
  setEnabled(enabled: boolean): void;
}

export const useChimeStore = create<ChimeState>((set) => ({
  enabled: true,
  hydrate() {
    try {
      set({ enabled: window.localStorage.getItem(OFF_KEY) !== "1" });
    } catch {
      /* storage blocked: keep the default */
    }
  },
  setEnabled(enabled) {
    set({ enabled });
    try {
      if (enabled) window.localStorage.removeItem(OFF_KEY);
      else window.localStorage.setItem(OFF_KEY, "1");
    } catch {
      /* storage blocked: it still applies for this visit */
    }
  },
}));

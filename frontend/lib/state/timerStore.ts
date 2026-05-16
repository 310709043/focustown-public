"use client";

import { create } from "zustand";
import { sessionsApi } from "../api/endpoints";
import type { FocusSession, FocusSessionMode } from "../api/types.gen";

interface TimerState {
  mode: FocusSessionMode;
  durationSeconds: number;
  remaining: number;
  running: boolean;
  starting: boolean;
  session: FocusSession | null;
  tomatoCount: number;
  setMode: (m: FocusSessionMode, seconds: number) => void;
  start: (taskLabel?: string, partnerId?: string | null) => Promise<void>;
  tick: () => void;
  pause: () => void;
  reset: () => void;
  complete: () => Promise<void>;
}

const DEFAULTS: Record<FocusSessionMode, number> = {
  focus: 25 * 60,
  short: 5 * 60,
  long: 15 * 60,
};

export const useTimerStore = create<TimerState>((set, get) => ({
  mode: "focus",
  durationSeconds: DEFAULTS.focus,
  remaining: DEFAULTS.focus,
  running: false,
  starting: false,
  session: null,
  tomatoCount: 0,

  setMode(m, seconds) {
    set({ mode: m, durationSeconds: seconds, remaining: seconds, running: false });
  },

  async start(taskLabel, partnerId) {
    if (get().starting || get().running) return;
    const { mode, durationSeconds } = get();
    set({ starting: true });
    try {
      const session = await sessionsApi.start({
        mode,
        duration_seconds: durationSeconds,
        task_label: taskLabel ?? null,
        partner_user_id: partnerId ?? null,
      });
      set({ session, running: true, remaining: session.remaining_seconds });
    } finally {
      set({ starting: false });
    }
  },

  tick() {
    const { remaining, running } = get();
    if (!running) return;
    if (remaining <= 1) {
      set({ remaining: 0, running: false });
      void get().complete();
      return;
    }
    set({ remaining: remaining - 1 });
  },

  pause() {
    set({ running: false });
  },

  reset() {
    set({ remaining: get().durationSeconds, running: false, session: null });
  },

  async complete() {
    const { session, tomatoCount, mode } = get();
    if (!session) return;
    await sessionsApi.complete(session.id);
    set({
      session: null,
      tomatoCount: mode === "focus" ? Math.min(4, tomatoCount + 1) : tomatoCount,
    });
  },
}));

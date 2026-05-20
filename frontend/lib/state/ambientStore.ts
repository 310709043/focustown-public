"use client";

import { create } from "zustand";

import {
  FOCUS_BG_OPTIONS,
  focusBgIndex,
  type FocusBgId,
} from "@/lib/data/focusBackgrounds";

const CYCLE_MS = 90 * 1000;
const FADE_MS = 25 * 1000;
const LOCK_KEY = "lowbatterytown.ambient.lock";

interface AmbientState {
  /** Index of the currently dominant scene (opacity → 1). */
  fromIdx: number;
  /** Index of the scene crossfading in. Equals `fromIdx` when stable. */
  toIdx: number;
  /** Crossfade progress in [0, 1]; 1 when stable, < 1 while fading. */
  t: number;
  isFading: boolean;
  /** Test-mode override: when set, store holds at that scene forever. */
  lockId: FocusBgId | null;
  /** rAF time origin; null until the first `initialize()`. */
  startedAt: number | null;
  initialize: () => void;
  tick: (now: number) => void;
  setLock: (id: FocusBgId | null) => void;
}

/**
 * Writer for the solo room's auto-cycling sky. SRP: only mutates state.
 * Rendering subscribes via `useAmbientCycle` (Reader) and `useAmbientStore`
 * selectors. Both server-render values (`fromIdx=0`, `t=1`) are stable so
 * SSR/CSR first paint match — see `hydration-gotchas`.
 */
export const useAmbientStore = create<AmbientState>((set, get) => ({
  fromIdx: 0,
  toIdx: 0,
  t: 1,
  isFading: false,
  lockId: null,
  startedAt: null,

  initialize() {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(LOCK_KEY);
    const lock = raw && FOCUS_BG_OPTIONS.some((o) => o.id === raw)
      ? (raw as FocusBgId)
      : null;
    const idx = lock ? focusBgIndex(lock) : 0;
    set({
      fromIdx: idx,
      toIdx: idx,
      t: 1,
      isFading: false,
      lockId: lock,
      startedAt: performance.now(),
    });
  },

  tick(now) {
    const s = get();
    if (s.lockId !== null || s.startedAt === null) return;
    const elapsed = now - s.startedAt;
    const into = elapsed % CYCLE_MS;
    const cycleNumber = Math.floor(elapsed / CYCLE_MS);
    const baseIdx = cycleNumber % FOCUS_BG_OPTIONS.length;

    if (into < CYCLE_MS - FADE_MS) {
      // Stable phase: hold on baseIdx.
      if (s.isFading || s.fromIdx !== baseIdx || s.toIdx !== baseIdx || s.t !== 1) {
        set({ fromIdx: baseIdx, toIdx: baseIdx, t: 1, isFading: false });
      }
    } else {
      // Crossfade phase: blend baseIdx → baseIdx + 1.
      const f = Math.min(1, (into - (CYCLE_MS - FADE_MS)) / FADE_MS);
      const nextIdx = (baseIdx + 1) % FOCUS_BG_OPTIONS.length;
      if (s.fromIdx !== baseIdx || s.toIdx !== nextIdx || s.t !== f || !s.isFading) {
        set({ fromIdx: baseIdx, toIdx: nextIdx, t: f, isFading: true });
      }
    }
  },

  setLock(id) {
    if (typeof window === "undefined") return;
    if (id === null) {
      window.localStorage.removeItem(LOCK_KEY);
    } else {
      window.localStorage.setItem(LOCK_KEY, id);
    }
    const idx = id ? focusBgIndex(id) : get().fromIdx;
    set({
      fromIdx: idx,
      toIdx: idx,
      t: 1,
      isFading: false,
      lockId: id,
    });
  },
}));

"use client";

import { create } from "zustand";
import { matchesApi } from "../api/endpoints";
import type { Match } from "../api/types.gen";

interface MatchState {
  current: Match | null;
  /**
   * The most recently accepted match — survives the modal closing so the
   * focus room page can read partner metadata without a second HTTP call.
   * Cleared when a new match is proposed/accepted or when the next focus
   * session ends.
   */
  accepted: Match | null;
  proposing: boolean;
  accepting: boolean;
  skipping: boolean;
  propose: (candidateId: string) => Promise<void>;
  requestAuto: () => Promise<Match | null>;
  accept: () => Promise<Match | null>;
  skip: () => Promise<void>;
  clear: () => void;
  /**
   * Test-only: inject a proposal directly into the store, bypassing the
   * WS fan-out and the matches API. Used by E2E specs that need a
   * deterministic open trigger for the MatchModal. Real consumers should
   * never call this — use `requestAuto` / `propose`, or rely on the
   * `useRealtimeMatch` hook to populate `current` from a `match.proposed`
   * frame. Gated by `process.env.NODE_ENV !== "production"` at the
   * window-bridge layer below; the action itself remains importable in
   * dev/test bundles only.
   */
  testInjectProposal: (m: Match) => void;
}

export const useMatchStore = create<MatchState>((set, get) => ({
  current: null,
  accepted: null,
  proposing: false,
  accepting: false,
  skipping: false,

  async propose(candidateId) {
    set({ proposing: true });
    try {
      const m = await matchesApi.propose(candidateId);
      set({ current: m });
    } finally {
      set({ proposing: false });
    }
  },

  async requestAuto() {
    set({ proposing: true });
    try {
      const m = await matchesApi.auto();
      set({ current: m });
      return m;
    } catch {
      set({ current: null });
      return null;
    } finally {
      set({ proposing: false });
    }
  },

  async accept() {
    if (get().accepting) return null;
    const cur = get().current;
    if (!cur) return null;
    set({ accepting: true });
    try {
      // Bot matches return already-accepted; skip the second HTTP call.
      if (cur.status === "accepted") {
        set({ current: null, accepted: cur });
        return cur;
      }
      const updated = await matchesApi.accept(cur.id);
      set({ current: null, accepted: updated });
      return updated;
    } finally {
      set({ accepting: false });
    }
  },

  async skip() {
    if (get().skipping) return;
    const cur = get().current;
    if (!cur) return;
    set({ skipping: true });
    try {
      await matchesApi.skip(cur.id);
      set({ current: null });
    } finally {
      set({ skipping: false });
    }
  },

  clear() {
    set({ current: null, accepted: null });
  },

  testInjectProposal(m) {
    set({ current: m });
  },
}));

/**
 * Expose the store on `window.__ftMatchStore` so Playwright specs can
 * inject a proposal via `page.evaluate`. See
 * `frontend/e2e/match-modal.spec.ts`. Gated to non-production builds so
 * we don't ship a writable-state escape hatch to real users; the
 * production bundle simply omits this side effect.
 *
 * The shape matches what zustand exposes natively
 * (`getState` / `setState`) plus a typed `testInjectProposal` shortcut.
 */
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as { __ftMatchStore?: unknown }).__ftMatchStore = {
    getState: useMatchStore.getState,
    setState: useMatchStore.setState,
    testInjectProposal: (m: Match) =>
      useMatchStore.getState().testInjectProposal(m),
  };
}

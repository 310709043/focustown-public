"use client";

import { create } from "zustand";
import { matchesApi } from "../api/endpoints";
import type { Match } from "../api/types.gen";

interface MatchState {
  current: Match | null;
  proposing: boolean;
  propose: (candidateId: string) => Promise<void>;
  accept: () => Promise<Match | null>;
  skip: () => Promise<void>;
  clear: () => void;
}

export const useMatchStore = create<MatchState>((set, get) => ({
  current: null,
  proposing: false,

  async propose(candidateId) {
    set({ proposing: true });
    try {
      const m = await matchesApi.propose(candidateId);
      set({ current: m });
    } finally {
      set({ proposing: false });
    }
  },

  async accept() {
    const cur = get().current;
    if (!cur) return null;
    const updated = await matchesApi.accept(cur.id);
    set({ current: null });
    return updated;
  },

  async skip() {
    const cur = get().current;
    if (!cur) return;
    await matchesApi.skip(cur.id);
    set({ current: null });
  },

  clear() {
    set({ current: null });
  },
}));

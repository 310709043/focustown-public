"use client";

import { create } from "zustand";
import { ApiError } from "../api/client";
import { matchesApi } from "../api/endpoints";
import type { Match } from "../api/types.gen";

/**
 * Status state machine for the matching flow.
 *
 * ```
 *   idle ──enterQueue()──► waiting ──WS match.proposed──► proposed
 *                                       │                     │
 *                                       └──cancelQueue()──┐    accept()
 *                                                       idle    │
 *                                                              ▼
 *                                                        accepting → accepted
 *                                                                        │
 *                                                                        ▼
 *                                                                       idle
 *
 *   proposed ──skip()──► waiting   (re-enters the queue; per design)
 * ```
 *
 * The single status field is what drives the modal: ``open = status !== "idle"``.
 * This decouples "a proposal exists" from "is the modal mounted" — the
 * modal stays visible across waiting → proposed transitions so the
 * ring/halo animation never blinks out.
 */
export type MatchStatus =
  | "idle"
  | "waiting"
  | "proposed"
  | "accepting"
  | "accepted";

interface MatchState {
  status: MatchStatus;
  current: Match | null;
  /**
   * Most recently accepted match. Survives a status reset so the focus
   * room can read partner metadata after the modal closes without a
   * second HTTP call.
   */
  accepted: Match | null;
  waitingSince: number | null;
  botFallbackAt: number | null;
  cancelling: boolean;

  propose: (candidateId: string) => Promise<void>;
  /** Enter the waiting pool. Server may pair immediately. */
  enterQueue: () => Promise<void>;
  /** Leave the waiting pool. */
  cancelQueue: () => Promise<void>;
  accept: () => Promise<Match | null>;
  /** Skip the current proposal — re-enters the queue. */
  skip: () => Promise<void>;
  /** Apply a ``match.proposed`` WS frame. No-op when not waiting. */
  applyProposed: (m: Match) => void;
  /**
   * Rehydrate the queue state from the backend after a page reload. The
   * status field is sessionStorage-persisted, but we always re-confirm
   * with the server (the queue could have moved on while the tab was
   * away — bot fallback fired, or another tab cancelled).
   */
  rehydrate: () => Promise<void>;
  clear: () => void;
  /**
   * Test-only: inject a proposal directly into the store, bypassing the
   * WS fan-out and the matches API. Gated by the window-bridge below to
   * non-production builds.
   */
  testInjectProposal: (m: Match) => void;
}

const SESSION_KEY = "lowbatterytown.matchStore";

type Persisted = {
  status: Extract<MatchStatus, "waiting" | "proposed">;
  waitingSince: number | null;
  botFallbackAt: number | null;
};

function persist(s: Pick<MatchState, "status" | "waitingSince" | "botFallbackAt">): void {
  if (typeof window === "undefined") return;
  if (s.status !== "waiting" && s.status !== "proposed") {
    window.sessionStorage.removeItem(SESSION_KEY);
    return;
  }
  const payload: Persisted = {
    status: s.status,
    waitingSince: s.waitingSince,
    botFallbackAt: s.botFallbackAt,
  };
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  } catch {
    /* private mode or quota — degrade silently */
  }
}

function loadPersisted(): Persisted | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Persisted;
    if (p.status !== "waiting" && p.status !== "proposed") return null;
    return p;
  } catch {
    return null;
  }
}

const initialPersisted = loadPersisted();

export const useMatchStore = create<MatchState>((set, get) => ({
  status: initialPersisted?.status ?? "idle",
  current: null,
  accepted: null,
  waitingSince: initialPersisted?.waitingSince ?? null,
  botFallbackAt: initialPersisted?.botFallbackAt ?? null,
  cancelling: false,

  async propose(candidateId) {
    set({ status: "accepting" });
    try {
      const m = await matchesApi.propose(candidateId);
      set({ status: "proposed", current: m });
      persist({ status: "proposed", waitingSince: null, botFallbackAt: null });
    } catch (e) {
      set({ status: "idle", current: null });
      persist({ status: "idle", waitingSince: null, botFallbackAt: null });
      throw e;
    }
  },

  async enterQueue() {
    const s = get().status;
    if (s === "waiting" || s === "proposed" || s === "accepting") return;
    try {
      const res = await matchesApi.auto();
      if (res.status === "matched") {
        set({
          status: "proposed",
          current: res.match,
          waitingSince: null,
          botFallbackAt: null,
        });
        persist({
          status: "proposed",
          waitingSince: null,
          botFallbackAt: null,
        });
        return;
      }
      set({
        status: "waiting",
        current: null,
        waitingSince: res.enqueued_at_ms,
        botFallbackAt: res.bot_fallback_at_ms,
      });
      persist({
        status: "waiting",
        waitingSince: res.enqueued_at_ms,
        botFallbackAt: res.bot_fallback_at_ms,
      });
    } catch {
      set({
        status: "idle",
        current: null,
        waitingSince: null,
        botFallbackAt: null,
      });
      persist({ status: "idle", waitingSince: null, botFallbackAt: null });
    }
  },

  async cancelQueue() {
    if (get().cancelling) return;
    set({ cancelling: true });
    try {
      await matchesApi.cancelQueue();
    } catch {
      /* idempotent — even if the call fails the user wants out */
    } finally {
      set({
        status: "idle",
        current: null,
        waitingSince: null,
        botFallbackAt: null,
        cancelling: false,
      });
      persist({ status: "idle", waitingSince: null, botFallbackAt: null });
    }
  },

  async accept() {
    const s = get().status;
    if (s === "accepting") return null;
    const cur = get().current;
    if (!cur) return null;
    set({ status: "accepting" });
    try {
      // Bot fallback matches are already accepted server-side; skip the
      // second HTTP call to avoid the no-op accept-already-accepted 409.
      if (cur.status === "accepted") {
        set({
          status: "accepted",
          current: null,
          accepted: cur,
          waitingSince: null,
          botFallbackAt: null,
        });
        persist({ status: "idle", waitingSince: null, botFallbackAt: null });
        return cur;
      }
      const updated = await matchesApi.accept(cur.id);
      set({
        status: "accepted",
        current: null,
        accepted: updated,
        waitingSince: null,
        botFallbackAt: null,
      });
      persist({ status: "idle", waitingSince: null, botFallbackAt: null });
      return updated;
    } catch {
      set({ status: "proposed" });
      return null;
    }
  },

  async skip() {
    const cur = get().current;
    if (!cur) return;
    if (get().status !== "proposed") return;
    set({ status: "waiting" });
    try {
      await matchesApi.skip(cur.id);
    } catch {
      /* the skip failure shouldn't trap the user in the modal — fall through
         into the re-enqueue attempt regardless */
    }
    set({ current: null });
    try {
      const res = await matchesApi.auto();
      if (res.status === "matched") {
        set({
          status: "proposed",
          current: res.match,
          waitingSince: null,
          botFallbackAt: null,
        });
        persist({
          status: "proposed",
          waitingSince: null,
          botFallbackAt: null,
        });
        return;
      }
      set({
        status: "waiting",
        current: null,
        waitingSince: res.enqueued_at_ms,
        botFallbackAt: res.bot_fallback_at_ms,
      });
      persist({
        status: "waiting",
        waitingSince: res.enqueued_at_ms,
        botFallbackAt: res.bot_fallback_at_ms,
      });
    } catch {
      set({
        status: "idle",
        current: null,
        waitingSince: null,
        botFallbackAt: null,
      });
      persist({ status: "idle", waitingSince: null, botFallbackAt: null });
    }
  },

  applyProposed(m) {
    // Only the first frame for a given proposal causes a state transition.
    // The candidate side may receive two frames (one from the legacy
    // MatchRealtimeLink subscriber + one from MatchingQueueService); the
    // guard makes the second a no-op so the modal doesn't flash.
    if (get().status !== "waiting") return;
    set({
      status: "proposed",
      current: m,
      waitingSince: null,
      botFallbackAt: null,
    });
    persist({ status: "proposed", waitingSince: null, botFallbackAt: null });
  },

  async rehydrate() {
    const persisted = loadPersisted();
    if (!persisted || persisted.status !== "waiting") {
      set({
        status: "idle",
        waitingSince: null,
        botFallbackAt: null,
      });
      persist({ status: "idle", waitingSince: null, botFallbackAt: null });
      return;
    }
    try {
      const res = await matchesApi.myQueue();
      set({
        status: "waiting",
        waitingSince: res.enqueued_at_ms,
        botFallbackAt: res.bot_fallback_at_ms,
      });
      persist({
        status: "waiting",
        waitingSince: res.enqueued_at_ms,
        botFallbackAt: res.bot_fallback_at_ms,
      });
    } catch (e) {
      // 404 not_in_queue: backend has moved on (bot fallback fired while
      // the tab was away, or the WS disconnect hook dropped us). Reset
      // and let the user re-enqueue if they still want to match.
      if (e instanceof ApiError && e.status === 404) {
        set({
          status: "idle",
          current: null,
          waitingSince: null,
          botFallbackAt: null,
        });
        persist({ status: "idle", waitingSince: null, botFallbackAt: null });
      }
    }
  },

  clear() {
    set({
      status: "idle",
      current: null,
      accepted: null,
      waitingSince: null,
      botFallbackAt: null,
    });
    persist({ status: "idle", waitingSince: null, botFallbackAt: null });
  },

  testInjectProposal(m) {
    set({ status: "proposed", current: m });
  },
}));

/**
 * Expose the store on `window.__ftMatchStore` so Playwright specs can
 * inject a proposal via `page.evaluate`. See
 * `frontend/e2e/match-modal.spec.ts`. Gated to non-production builds.
 */
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as { __ftMatchStore?: unknown }).__ftMatchStore = {
    getState: useMatchStore.getState,
    setState: useMatchStore.setState,
    testInjectProposal: (m: Match) =>
      useMatchStore.getState().testInjectProposal(m),
  };
}

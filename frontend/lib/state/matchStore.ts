"use client";

import { create } from "zustand";
import { ApiError } from "../api/client";
import { matchesApi } from "../api/endpoints";
import type { Match } from "../api/types.gen";

/**
 * Status state machine for the matching flow.
 *
 * ```
 *   idle ──enterQueue()──► waiting ──WS match.proposed──► accepting → accepted
 *                              │           (auto-accept)
 *                              └──cancelQueue()──► idle
 * ```
 *
 * Per product decision: the user no longer chooses Accept / Skip on a
 * proposal — landing in the focus room is the reveal. The modal stays
 * mounted across waiting → accepting transitions so the rotating halo
 * never blinks out; ``open = status !== "idle" && status !== "accepted"``
 * (the page nav handler clears state right after).
 */
export type MatchStatus =
  | "idle"
  | "waiting"
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
  /** Apply a ``match.proposed`` WS frame by transitioning straight into
   *  the accept call. The room reveal is the surprise — there is no
   *  user-facing proposal step anymore. */
  applyProposed: (m: Match) => Promise<Match | null>;
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
  status: Extract<MatchStatus, "waiting">;
  waitingSince: number | null;
  botFallbackAt: number | null;
};

function persist(s: Pick<MatchState, "status" | "waitingSince" | "botFallbackAt">): void {
  if (typeof window === "undefined") return;
  if (s.status !== "waiting") {
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
    if (p.status !== "waiting") return null;
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
      set({ status: "accepting", current: m });
      persist({ status: "idle", waitingSince: null, botFallbackAt: null });
    } catch (e) {
      set({ status: "idle", current: null });
      persist({ status: "idle", waitingSince: null, botFallbackAt: null });
      throw e;
    }
  },

  async enterQueue() {
    const s = get().status;
    if (s === "waiting" || s === "accepting") return;
    try {
      const res = await matchesApi.auto();
      if (res.status === "matched") {
        // Immediate bot fallback: skip the modal step entirely. The
        // backend has already accepted the match server-side (bot
        // fallback path), so just stash it and let the page nav fire.
        set({
          status: "accepted",
          current: null,
          accepted: res.match,
          waitingSince: null,
          botFallbackAt: null,
        });
        persist({ status: "idle", waitingSince: null, botFallbackAt: null });
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
    persist({ status: "idle", waitingSince: null, botFallbackAt: null });
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
      return updated;
    } catch {
      // Accept failed — drop back to idle so the user can re-queue. The
      // old design rewound to "proposed" so the user could retry; with
      // auto-accept there is no manual retry surface, so idle is the
      // honest state.
      set({
        status: "idle",
        current: null,
        waitingSince: null,
        botFallbackAt: null,
      });
      return null;
    }
  },

  async applyProposed(m) {
    // Only the first frame for a given proposal triggers acceptance.
    // The candidate side may receive duplicate frames (legacy
    // MatchRealtimeLink + MatchingQueueService); guard so the second
    // frame becomes a no-op instead of double-accepting.
    if (get().status !== "waiting") return null;
    // Stage the proposal as ``current`` while we delegate to accept().
    // We deliberately leave ``status`` as "waiting" here — accept()
    // flips it to "accepting" itself, and its leading guard would
    // early-return if it saw "accepting" already on the way in.
    set({
      current: m,
      waitingSince: null,
      botFallbackAt: null,
    });
    persist({ status: "idle", waitingSince: null, botFallbackAt: null });
    return await get().accept();
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
    // Mirrors the production WS path: set status to ``accepting`` with
    // the proposal in flight. Production code would await the real
    // accept call; tests can flip to "accepted" themselves once they've
    // verified intermediate UI.
    set({ status: "accepting", current: m });
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

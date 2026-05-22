"use client";

import { create } from "zustand";
import { ApiError } from "../api/client";
import {
  matchRoomApi,
  type MatchRoomSnapshot,
  type MatchRoomStatusDTO,
  type MatchRoomParticipant,
} from "../api/endpoints";

/**
 * Phase 7 — shared-focus-room state.
 *
 * Distinct from ``roomStore.ts`` (owner-rooms with decor / playback).
 * This store mirrors the server-side ``match_rooms`` row plus its two
 * ``room_participants`` so the focus page can render the "Waiting for
 * partner" overlay until the second side calls ``join``. Phase 8 will
 * plug the WS frames (``room.partner_joined`` / ``room.ready``) into
 * the same ``applyServerSnapshot`` seam.
 */

type LoadStatus = "idle" | "loading" | "ready" | "error";

interface FocusRoomState {
  matchId: string | null;
  roomId: string | null;
  status: MatchRoomStatusDTO | null;
  participants: MatchRoomParticipant[];
  loadStatus: LoadStatus;
  /**
   * The latest error code from a failed fetch. ``not_found`` covers both
   * "no room for this match yet" AND "caller is not a participant"
   * (the backend returns 404 in both cases to avoid leaking existence).
   */
  errorCode: string | null;

  /** Fetch + populate from the server. Safe to call multiple times. */
  hydrate(matchId: string): Promise<void>;
  /** POST /rooms/match/{id}/join — flips the caller's joined_at. */
  join(matchId: string): Promise<MatchRoomSnapshot | null>;
  /** POST /rooms/match/{id}/leave — flips the caller's left_at. */
  leave(matchId: string): Promise<MatchRoomSnapshot | null>;
  /** Replace the in-store snapshot — used by hydrate + Phase 8 WS. */
  applyServerSnapshot(snapshot: MatchRoomSnapshot): void;
  reset(): void;
}

function snapshotToState(s: MatchRoomSnapshot): {
  matchId: string;
  roomId: string;
  status: MatchRoomStatusDTO;
  participants: MatchRoomParticipant[];
} {
  return {
    matchId: s.match_id,
    roomId: s.id,
    status: s.status,
    participants: s.participants,
  };
}

export const useFocusRoomStore = create<FocusRoomState>((set, get) => ({
  matchId: null,
  roomId: null,
  status: null,
  participants: [],
  loadStatus: "idle",
  errorCode: null,

  async hydrate(matchId) {
    set({ loadStatus: "loading", errorCode: null });
    try {
      const snap = await matchRoomApi.getSnapshot(matchId);
      set({
        ...snapshotToState(snap),
        loadStatus: "ready",
        errorCode: null,
      });
    } catch (err) {
      const code =
        err instanceof ApiError && err.status === 404
          ? "not_found"
          : err instanceof Error
            ? err.message
            : "load_failed";
      set({
        matchId,
        roomId: null,
        status: null,
        participants: [],
        loadStatus: "error",
        errorCode: code,
      });
    }
  },

  async join(matchId) {
    try {
      const snap = await matchRoomApi.join(matchId);
      get().applyServerSnapshot(snap);
      return snap;
    } catch (err) {
      const code =
        err instanceof ApiError && err.status === 404
          ? "not_found"
          : err instanceof Error
            ? err.message
            : "join_failed";
      set({ errorCode: code });
      return null;
    }
  },

  async leave(matchId) {
    try {
      const snap = await matchRoomApi.leave(matchId);
      get().applyServerSnapshot(snap);
      return snap;
    } catch (err) {
      const code =
        err instanceof ApiError && err.status === 404
          ? "not_found"
          : err instanceof Error
            ? err.message
            : "leave_failed";
      set({ errorCode: code });
      return null;
    }
  },

  applyServerSnapshot(snapshot) {
    set({
      ...snapshotToState(snapshot),
      loadStatus: "ready",
      errorCode: null,
    });
  },

  reset() {
    set({
      matchId: null,
      roomId: null,
      status: null,
      participants: [],
      loadStatus: "idle",
      errorCode: null,
    });
  },
}));

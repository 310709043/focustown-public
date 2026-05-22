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
 * partner" overlay until the second side calls ``join``.
 *
 * Phase 8 — extended to consume 8 ``room.*`` WS frames and to read the
 * countdown from the server's ``room.timer_tick`` (no local
 * setInterval — drift between two browsers compounds visibly within
 * 30s).
 */

type LoadStatus = "idle" | "loading" | "ready" | "error";

interface TimerState {
  /** Unix ms epoch the server stamped at ``session_started``. */
  startedAt: number | null;
  /** Planned duration in seconds (the value passed to /start). */
  durationSeconds: number | null;
  /** Last value from a ``timer_tick`` frame or the snapshot. */
  remainingSeconds: number | null;
  /** True between ``session_started`` and ``session_completed`` /
   *  ``ended`` — the UI uses this to swap the start button for the
   *  countdown display. */
  isTicking: boolean;
}

const EMPTY_TIMER: TimerState = {
  startedAt: null,
  durationSeconds: null,
  remainingSeconds: null,
  isTicking: false,
};

interface FocusRoomState {
  matchId: string | null;
  roomId: string | null;
  status: MatchRoomStatusDTO | null;
  participants: MatchRoomParticipant[];
  timer: TimerState;
  /** Reason from the last ``room.ended`` frame — drives the post-end
   *  banner copy. */
  endedReason: string | null;
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
  /** POST /rooms/match/{id}/start — arms the shared countdown. */
  startSession(
    matchId: string,
    durationSeconds: number,
  ): Promise<MatchRoomSnapshot | null>;
  /** Replace the in-store snapshot — used by hydrate + Phase 8 WS. */
  applyServerSnapshot(snapshot: MatchRoomSnapshot): void;

  // ── Phase 8 WS frame handlers ────────────────────────────────────
  onRoomOpened(frame: {
    room_id: string;
    match_id: string;
    requester_id: string;
    candidate_id: string;
  }): void;
  onRoomPartnerJoined(frame: { room_id: string; user_id: string }): void;
  onRoomPartnerLeft(frame: { room_id: string; user_id: string }): void;
  onRoomReady(frame: { room_id: string }): void;
  onRoomSessionStarted(frame: {
    room_id: string;
    started_at: number;
    duration_seconds: number;
  }): void;
  onRoomTimerTick(frame: {
    room_id: string;
    elapsed_seconds: number;
    remaining_seconds: number;
  }): void;
  onRoomSessionCompleted(frame: { room_id: string }): void;
  onRoomEnded(frame: { room_id: string; reason: string }): void;

  reset(): void;
}

function snapshotToTimer(s: MatchRoomSnapshot): TimerState {
  if (s.status !== "active" || s.timer_started_at == null) {
    return EMPTY_TIMER;
  }
  const startedAtMs = Date.parse(s.timer_started_at);
  return {
    startedAt: Number.isFinite(startedAtMs) ? startedAtMs : null,
    durationSeconds: s.timer_duration_seconds,
    remainingSeconds: s.timer_remaining_seconds,
    isTicking:
      s.timer_remaining_seconds !== null && s.timer_remaining_seconds > 0,
  };
}

function snapshotToState(s: MatchRoomSnapshot): {
  matchId: string;
  roomId: string;
  status: MatchRoomStatusDTO;
  participants: MatchRoomParticipant[];
  timer: TimerState;
  endedReason: string | null;
} {
  return {
    matchId: s.match_id,
    roomId: s.id,
    status: s.status,
    participants: s.participants,
    timer: snapshotToTimer(s),
    endedReason: s.ended_reason,
  };
}

function ignoreForeignRoom(currentRoomId: string | null, frameRoomId: string) {
  // The single multiplexed WS connection can deliver frames for the
  // previous /focus/[id] page until the unsubscribe op lands. Drop
  // any frame addressed to a room the store isn't tracking.
  return currentRoomId !== null && currentRoomId !== frameRoomId;
}

export const useFocusRoomStore = create<FocusRoomState>((set, get) => ({
  matchId: null,
  roomId: null,
  status: null,
  participants: [],
  timer: EMPTY_TIMER,
  endedReason: null,
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
        timer: EMPTY_TIMER,
        endedReason: null,
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

  async startSession(matchId, durationSeconds) {
    try {
      const snap = await matchRoomApi.startSession(matchId, durationSeconds);
      get().applyServerSnapshot(snap);
      return snap;
    } catch (err) {
      const code =
        err instanceof ApiError
          ? err.status === 404
            ? "not_found"
            : err.status === 409
              ? "room_not_ready"
              : err.message
          : err instanceof Error
            ? err.message
            : "start_failed";
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

  // ── WS frame handlers ───────────────────────────────────────────
  onRoomOpened(frame) {
    if (ignoreForeignRoom(get().roomId, frame.room_id)) return;
    set({ status: "open", roomId: frame.room_id, matchId: frame.match_id });
  },

  onRoomPartnerJoined(frame) {
    if (ignoreForeignRoom(get().roomId, frame.room_id)) return;
    const current = get().participants;
    const next = current.map((p) =>
      p.user_id === frame.user_id && p.joined_at == null
        ? { ...p, joined_at: new Date().toISOString() }
        : p,
    );
    set({ participants: next });
  },

  onRoomPartnerLeft(frame) {
    if (ignoreForeignRoom(get().roomId, frame.room_id)) return;
    const current = get().participants;
    const next = current.map((p) =>
      p.user_id === frame.user_id && p.left_at == null
        ? { ...p, left_at: new Date().toISOString() }
        : p,
    );
    set({ participants: next });
  },

  onRoomReady(frame) {
    if (ignoreForeignRoom(get().roomId, frame.room_id)) return;
    set({ status: "both_joined" });
  },

  onRoomSessionStarted(frame) {
    if (ignoreForeignRoom(get().roomId, frame.room_id)) return;
    set({
      status: "active",
      timer: {
        startedAt: frame.started_at,
        durationSeconds: frame.duration_seconds,
        remainingSeconds: frame.duration_seconds,
        isTicking: true,
      },
    });
  },

  onRoomTimerTick(frame) {
    if (ignoreForeignRoom(get().roomId, frame.room_id)) return;
    const timer = get().timer;
    set({
      timer: {
        ...timer,
        remainingSeconds: frame.remaining_seconds,
        isTicking: frame.remaining_seconds > 0,
      },
    });
  },

  onRoomSessionCompleted(frame) {
    if (ignoreForeignRoom(get().roomId, frame.room_id)) return;
    const timer = get().timer;
    set({
      timer: { ...timer, remainingSeconds: 0, isTicking: false },
    });
  },

  onRoomEnded(frame) {
    if (ignoreForeignRoom(get().roomId, frame.room_id)) return;
    set({
      status: "ended",
      endedReason: frame.reason,
      timer: { ...get().timer, isTicking: false },
    });
  },

  reset() {
    set({
      matchId: null,
      roomId: null,
      status: null,
      participants: [],
      timer: EMPTY_TIMER,
      endedReason: null,
      loadStatus: "idle",
      errorCode: null,
    });
  },
}));

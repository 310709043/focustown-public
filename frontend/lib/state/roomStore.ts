"use client";

import { create } from "zustand";
import { roomApi } from "../api/endpoints";
import type { Room, RoomTheme } from "../api/types.gen";

/**
 * Phase 4 client-side room cache.
 *
 * Mostly a thin wrapper around `roomApi` so the room page can render
 * optimistically and revert on failure. There is no WebSocket presence
 * yet for rooms — Phase 8 will introduce visitor counts + chat.
 */

interface RoomStore {
  myRoom: Room | null;
  loading: boolean;
  error: string | null;
  hydrate: () => Promise<Room>;
  update: (patch: { name?: string; theme?: RoomTheme }) => Promise<void>;
  reset: () => void;
}

export const useRoomStore = create<RoomStore>((set, get) => ({
  myRoom: null,
  loading: false,
  error: null,

  async hydrate() {
    set({ loading: true, error: null });
    try {
      const room = await roomApi.getMine();
      set({ myRoom: room, loading: false });
      return room;
    } catch (err) {
      const message = err instanceof Error ? err.message : "room_load_failed";
      set({ loading: false, error: message });
      throw err;
    }
  },

  async update(patch) {
    const previous = get().myRoom;
    if (!previous) {
      throw new Error("room_not_hydrated");
    }
    // Optimistic apply — revert from server response (which may have
    // trimmed name etc.) and reset error on success.
    set({
      myRoom: { ...previous, ...patch },
      error: null,
    });
    try {
      const fresh = await roomApi.updateMine(patch);
      set({ myRoom: fresh });
    } catch (err) {
      set({
        myRoom: previous,
        error: err instanceof Error ? err.message : "room_update_failed",
      });
      throw err;
    }
  },

  reset() {
    set({ myRoom: null, loading: false, error: null });
  },
}));

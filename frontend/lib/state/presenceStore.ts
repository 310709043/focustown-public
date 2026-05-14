"use client";

import { create } from "zustand";
import type { StreetUser } from "../api/types.gen";
import type { PresenceStateValue } from "../ws/client";

/**
 * Phase 1 client-side presence cache.
 *
 * Source of truth is the server (`GET /api/v1/presence/street`); this store
 * is the local projection that the street view reads. Two write paths feed
 * it:
 *   - `hydrate(snapshot)` — full refresh from HTTP (on mount + every 60s)
 *   - `applyDelta(msg)`  — incremental WS update (presence.changed)
 *
 * If a delta arrives for an unknown user, we flip `pendingRehydrate` to
 * `true` so the consuming page can re-fetch the snapshot (we don't carry
 * display_name + character_key in the WS payload, by design).
 *
 * All mutations are immutable per project rules (`.claude/rules/coding-style.md`).
 */

export type PresenceDelta = {
  user_id: string;
  state?: PresenceStateValue;
  status?: string;
  /** Phase 3: signals the receiving client to re-fetch /presence/street so
   * the vehicle render_meta lands. */
  equipment_changed?: boolean;
};

interface PresenceStore {
  byId: Record<string, StreetUser>;
  pendingRehydrate: boolean;
  hydrate: (users: StreetUser[]) => void;
  applyDelta: (msg: PresenceDelta) => void;
  clearPendingRehydrate: () => void;
  reset: () => void;
  onStreet: () => StreetUser[];
}

export const usePresenceStore = create<PresenceStore>((set, get) => ({
  byId: {},
  pendingRehydrate: false,

  hydrate(users) {
    const byId: Record<string, StreetUser> = {};
    for (const u of users) byId[u.id] = u;
    set({ byId, pendingRehydrate: false });
  },

  applyDelta(msg) {
    const { user_id, state, status, equipment_changed } = msg;

    set((prev) => {
      // Equipment changes don't carry the new render_meta on the wire; force a
      // snapshot fetch so the next render uses the right colors. This takes
      // precedence over the status/state branches below.
      if (equipment_changed) {
        return { ...prev, pendingRehydrate: true };
      }

      const existing = prev.byId[user_id];

      // Departures: drop from the street view entirely.
      if (state === "offline" || state === "in_room") {
        if (!existing) return prev;
        const { [user_id]: _gone, ...rest } = prev.byId;
        return { ...prev, byId: rest };
      }

      // Arrivals: existing user reconnecting → patch; unknown → request rehydrate.
      if (state === "on_street") {
        if (!existing) {
          return { ...prev, pendingRehydrate: true };
        }
        return {
          ...prev,
          byId: {
            ...prev.byId,
            [user_id]: { ...existing, status: status ?? existing.status },
          },
        };
      }

      // Status-only updates: only meaningful if we already know this user.
      if (status && existing) {
        return {
          ...prev,
          byId: {
            ...prev.byId,
            [user_id]: { ...existing, status },
          },
        };
      }
      return prev;
    });
  },

  clearPendingRehydrate() {
    set({ pendingRehydrate: false });
  },

  reset() {
    set({ byId: {}, pendingRehydrate: false });
  },

  onStreet() {
    return Object.values(get().byId);
  },
}));

"use client";

import { create } from "zustand";

import type { FocusingNowItem, FriendSummary } from "@/lib/api/endpoints";

/**
 * Client-side cache for the friend graph.
 *
 * Hydration happens via two paths:
 *   1. ``hydrate({ accepted, incoming })`` after the initial REST fetch
 *      inside FriendsView / FriendsNow.
 *   2. ``applyEvent`` on incoming WS payloads (friend.requested /
 *      friend.accepted / friend.rejected / friend.removed) so the
 *      panels stay live without polling.
 *
 * Stored as `byFriendshipId` for O(1) updates by friendship id, plus a
 * `focusingNow` slice for the "FRIENDS NOW" widget.
 */
/**
 * WS payload shape emitted by ``FriendshipService._publish_event``.
 *
 *   { type: "friend.requested" | "friend.accepted" |
 *           "friend.rejected" | "friend.removed",
 *     friendship_id, status, requested_by, other_user_id }
 *
 * The backend keeps the wire format flat (no full ``FriendSummary``) so
 * fan-out frames stay small. ``applyEvent`` translates the flat shape
 * into store mutations:
 *
 *   - ``friend.requested`` from another user → optimistic upsert with a
 *     placeholder display name; ``FriendsView.reload`` is expected to
 *     replace it with the canonical row on next refresh.
 *   - ``friend.accepted`` → set ``status=accepted`` if we already have
 *     the row; otherwise upsert placeholder (the same hydrate will
 *     fix it).
 *   - ``friend.rejected`` / ``friend.removed`` → drop the row.
 */
export type FriendEventPayload = {
  type:
    | "friend.requested"
    | "friend.accepted"
    | "friend.rejected"
    | "friend.removed";
  // Other-user public fields carried on the wire from
  // FriendshipService._publish_event so the receiving FE renders the row
  // without falling back to "UUID as display_name". Optional for forward
  // compatibility with payloads from older backend versions.
  other_display_name?: string | null;
  other_character_key?: string | null;
  friendship_id: string;
  status: "requested" | "accepted" | "blocked";
  requested_by: string;
  other_user_id: string;
};

interface FriendsStore {
  byFriendshipId: Record<string, FriendSummary>;
  focusingNow: FocusingNowItem[];

  hydrate: (input: {
    accepted: FriendSummary[];
    incoming: FriendSummary[];
  }) => void;
  setFocusingNow: (rows: FocusingNowItem[]) => void;
  upsert: (friend: FriendSummary) => void;
  remove: (friendshipId: string) => void;
  applyEvent: (payload: FriendEventPayload, viewerId: string) => void;
  reset: () => void;
}

export const useFriendsStore = create<FriendsStore>((set) => ({
  byFriendshipId: {},
  focusingNow: [],

  hydrate({ accepted, incoming }) {
    const next: Record<string, FriendSummary> = {};
    for (const f of [...accepted, ...incoming]) next[f.friendship_id] = f;
    set({ byFriendshipId: next });
  },

  setFocusingNow(rows) {
    set({ focusingNow: rows });
  },

  upsert(friend) {
    set((prev) => ({
      byFriendshipId: { ...prev.byFriendshipId, [friend.friendship_id]: friend },
    }));
  },

  remove(friendshipId) {
    set((prev) => {
      if (!(friendshipId in prev.byFriendshipId)) return prev;
      const next = { ...prev.byFriendshipId };
      delete next[friendshipId];
      return { byFriendshipId: next };
    });
  },

  applyEvent(payload, viewerId) {
    set((prev) => {
      if (
        payload.type === "friend.rejected" ||
        payload.type === "friend.removed"
      ) {
        if (!(payload.friendship_id in prev.byFriendshipId)) return prev;
        const next = { ...prev.byFriendshipId };
        delete next[payload.friendship_id];
        return { byFriendshipId: next };
      }
      // requested / accepted: upsert. Patch onto the existing row when
      // present so we don't clobber display_name / character_key with
      // placeholders.
      const existing = prev.byFriendshipId[payload.friendship_id];
      const merged: FriendSummary = existing
        ? { ...existing, status: payload.status }
        : {
            friendship_id: payload.friendship_id,
            user_id: payload.other_user_id,
            display_name:
              payload.other_display_name ?? payload.other_user_id,
            character_key: payload.other_character_key ?? null,
            status: payload.status,
            requested_by_me: payload.requested_by === viewerId,
            created_at: new Date().toISOString(),
            accepted_at:
              payload.status === "accepted"
                ? new Date().toISOString()
                : null,
          };
      return {
        byFriendshipId: {
          ...prev.byFriendshipId,
          [payload.friendship_id]: merged,
        },
      };
    });
  },

  reset() {
    set({ byFriendshipId: {}, focusingNow: [] });
  },
}));

/** Derived selector helpers — kept outside the store to avoid coupling.
 *
 * Each selector memoises against the last ``byFriendshipId`` reference
 * it saw so equal contents return the same array reference. Without
 * this, ``useFriendsStore(selectAccepted)`` returns a fresh array on
 * every store tick and any consumer that uses the result as an effect
 * dep risks Maximum update depth (React #185) — see FriendsView for
 * the previous round of this bug.
 */
function memoOne<T>(
  fn: (state: FriendsStore) => T,
): (state: FriendsStore) => T {
  let lastKey: FriendsStore["byFriendshipId"] | null = null;
  let lastValue: T;
  return (state) => {
    if (state.byFriendshipId !== lastKey) {
      lastKey = state.byFriendshipId;
      lastValue = fn(state);
    }
    return lastValue;
  };
}

export const selectAccepted = memoOne<FriendSummary[]>((state) =>
  Object.values(state.byFriendshipId)
    .filter((f) => f.status === "accepted")
    .sort((a, b) => a.display_name.localeCompare(b.display_name)),
);

export const selectIncomingRequests = memoOne<FriendSummary[]>((state) =>
  Object.values(state.byFriendshipId).filter(
    (f) => f.status === "requested" && !f.requested_by_me,
  ),
);

export const selectOutgoingRequests = memoOne<FriendSummary[]>((state) =>
  Object.values(state.byFriendshipId).filter(
    (f) => f.status === "requested" && f.requested_by_me,
  ),
);

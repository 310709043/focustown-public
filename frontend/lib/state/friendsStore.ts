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

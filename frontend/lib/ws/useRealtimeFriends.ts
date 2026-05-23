"use client";

import { useRealtime } from "./useRealtime";
import { type FriendEventPayload, useFriendsStore } from "@/lib/state/friendsStore";
import { useAuthStore } from "@/lib/state/authStore";

const FRIEND_EVENT_TYPES: readonly FriendEventPayload["type"][] = [
  "friend.requested",
  "friend.accepted",
  "friend.rejected",
  "friend.removed",
];

function isFriendEvent(msg: { type: string }): msg is FriendEventPayload {
  return (FRIEND_EVENT_TYPES as readonly string[]).includes(msg.type);
}

/**
 * Subscribes the friends store to ``friend.*`` realtime frames so the
 * accepted/incoming/outgoing tabs stay live without polling.
 *
 * Mounted once on ``/town`` (and reused inside the deep-link `/u/[id]`
 * landing) so that whichever page the user lands on, an inbound friend
 * request shows up immediately.
 */
export function useRealtimeFriends(): void {
  useRealtime((msg) => {
    if (!isFriendEvent(msg)) return;
    const viewer = useAuthStore.getState().user;
    if (!viewer) return;
    useFriendsStore.getState().applyEvent(msg, viewer.id);
  });
}

/**
 * useRealtimeFriends — translates WS frames into friendsStore mutations.
 *
 * Worth testing:
 * - friend.requested/accepted/rejected/removed each route to applyEvent
 * - irrelevant WS frames are ignored (no store mutation)
 * - applyEvent is only called when a viewer is signed in (otherwise the
 *   payload has no "me" reference to derive requested_by_me from)
 */
import { renderHook } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

let _handler: ((msg: unknown) => void) | null = null;

vi.mock("@/lib/ws/useRealtime", () => ({
  useRealtime: (handler: (msg: unknown) => void) => {
    _handler = handler;
    return null;
  },
}));

import { useAuthStore } from "@/lib/state/authStore";
import { useFriendsStore } from "@/lib/state/friendsStore";
import { useRealtimeFriends } from "@/lib/ws/useRealtimeFriends";

function setViewer(id: string | null) {
  useAuthStore.setState({
    user: id
      ? ({
          id,
          email: `${id}@x.test`,
          display_name: id,
        } as unknown as ReturnType<
          typeof useAuthStore.getState
        >["user"])
      : null,
  });
}

beforeEach(() => {
  _handler = null;
  useFriendsStore.setState({ byFriendshipId: {}, focusingNow: [] });
  setViewer("u-me");
});

test("friend.requested payload upserts via applyEvent", () => {
  renderHook(() => useRealtimeFriends());

  _handler!({
    type: "friend.requested",
    friendship_id: "f-1",
    status: "requested",
    requested_by: "u-other",
    other_user_id: "u-other",
  });

  expect(useFriendsStore.getState().byFriendshipId["f-1"]).toBeDefined();
});

test("friend.removed payload removes via applyEvent", () => {
  useFriendsStore.getState().hydrate({
    accepted: [
      {
        friendship_id: "f-1",
        user_id: "u-other",
        display_name: "Other",
        character_key: null,
        status: "accepted",
        requested_by_me: false,
        created_at: "2026-01-01T00:00:00Z",
        accepted_at: "2026-01-01T00:00:00Z",
      },
    ],
    incoming: [],
  });
  renderHook(() => useRealtimeFriends());

  _handler!({
    type: "friend.removed",
    friendship_id: "f-1",
    status: "accepted",
    requested_by: "u-other",
    other_user_id: "u-other",
  });

  expect(useFriendsStore.getState().byFriendshipId["f-1"]).toBeUndefined();
});

test("irrelevant WS frames do not mutate the store", () => {
  renderHook(() => useRealtimeFriends());
  const before = useFriendsStore.getState().byFriendshipId;

  _handler!({ type: "chat", room_id: "r-1", text: "hi", from: "u-x" });

  expect(useFriendsStore.getState().byFriendshipId).toBe(before);
});

test("payload without a signed-in viewer is dropped", () => {
  setViewer(null);
  renderHook(() => useRealtimeFriends());

  _handler!({
    type: "friend.requested",
    friendship_id: "f-1",
    status: "requested",
    requested_by: "u-other",
    other_user_id: "u-other",
  });

  expect(useFriendsStore.getState().byFriendshipId["f-1"]).toBeUndefined();
});

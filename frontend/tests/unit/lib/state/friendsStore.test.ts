/**
 * friendsStore — friend-graph cache + WS-driven invalidation.
 *
 * Worth testing:
 * - hydrate merges accepted + incoming, indexed by friendship id
 * - upsert preserves other entries (it's a partial patch, not a replace)
 * - remove deletes only the matching id and is idempotent on unknown id
 * - reset wipes both byFriendshipId and focusingNow
 * - selectors filter by status + requested_by_me correctly so the UI
 *   panels (My Friends / Incoming / Outgoing) match what the user expects
 */
import { beforeEach, expect, test } from "vitest";

import type { FriendSummary, FocusingNowItem } from "@/lib/api/endpoints";
import {
  selectAccepted,
  selectIncomingRequests,
  selectOutgoingRequests,
  useFriendsStore,
} from "@/lib/state/friendsStore";

function mkFriend(overrides: Partial<FriendSummary>): FriendSummary {
  return {
    friendship_id: "f-1",
    user_id: "u-2",
    display_name: "Bob",
    character_key: null,
    status: "accepted",
    requested_by_me: false,
    created_at: "2026-01-01T00:00:00Z",
    accepted_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  useFriendsStore.setState({ byFriendshipId: {}, focusingNow: [] });
});

test("hydrate merges accepted + incoming into byFriendshipId", () => {
  const a = mkFriend({ friendship_id: "f-1", status: "accepted" });
  const b = mkFriend({ friendship_id: "f-2", status: "requested" });

  useFriendsStore.getState().hydrate({ accepted: [a], incoming: [b] });

  expect(Object.keys(useFriendsStore.getState().byFriendshipId).sort()).toEqual([
    "f-1",
    "f-2",
  ]);
});

test("upsert preserves other entries (partial patch)", () => {
  const a = mkFriend({ friendship_id: "f-1" });
  useFriendsStore.getState().hydrate({ accepted: [a], incoming: [] });

  const updated = mkFriend({ friendship_id: "f-1", display_name: "Bob v2" });
  useFriendsStore.getState().upsert(updated);

  expect(useFriendsStore.getState().byFriendshipId["f-1"].display_name).toBe(
    "Bob v2",
  );
});

test("remove deletes only the matching id", () => {
  const a = mkFriend({ friendship_id: "f-1" });
  const b = mkFriend({ friendship_id: "f-2" });
  useFriendsStore.getState().hydrate({ accepted: [a, b], incoming: [] });

  useFriendsStore.getState().remove("f-1");

  expect(Object.keys(useFriendsStore.getState().byFriendshipId)).toEqual(["f-2"]);
});

test("remove on unknown id is idempotent (no throw, no state churn)", () => {
  const a = mkFriend({ friendship_id: "f-1" });
  useFriendsStore.getState().hydrate({ accepted: [a], incoming: [] });

  useFriendsStore.getState().remove("nope");

  expect(useFriendsStore.getState().byFriendshipId["f-1"]).toBeDefined();
});

test("setFocusingNow replaces the focusing-now snapshot", () => {
  const row: FocusingNowItem = {
    user_id: "u-9",
    display_name: "Carol",
    character_key: null,
    session_id: "s-1",
    started_at: "2026-01-01T00:00:00Z",
    minutes_planned: 25,
  };

  useFriendsStore.getState().setFocusingNow([row]);

  expect(useFriendsStore.getState().focusingNow).toEqual([row]);
});

test("reset clears friends and focusingNow", () => {
  useFriendsStore.getState().hydrate({
    accepted: [mkFriend({})],
    incoming: [],
  });
  useFriendsStore.getState().setFocusingNow([
    {
      user_id: "u-9",
      display_name: "x",
      character_key: null,
      session_id: "s",
      started_at: "2026",
      minutes_planned: null,
    },
  ]);

  useFriendsStore.getState().reset();

  expect(useFriendsStore.getState().byFriendshipId).toEqual({});
  expect(useFriendsStore.getState().focusingNow).toEqual([]);
});

test("selectAccepted returns only accepted friends, alphabetically", () => {
  useFriendsStore.getState().hydrate({
    accepted: [
      mkFriend({ friendship_id: "f-1", display_name: "Charlie" }),
      mkFriend({ friendship_id: "f-2", display_name: "Alice" }),
    ],
    incoming: [
      mkFriend({ friendship_id: "f-3", display_name: "Bob", status: "requested" }),
    ],
  });

  const names = selectAccepted(useFriendsStore.getState()).map((f) => f.display_name);

  // Alice before Charlie; Bob excluded (status=requested).
  expect(names).toEqual(["Alice", "Charlie"]);
});

test("selectIncomingRequests returns only requested + not-by-me", () => {
  useFriendsStore.getState().hydrate({
    accepted: [],
    incoming: [
      mkFriend({ friendship_id: "f-1", status: "requested", requested_by_me: false }),
      mkFriend({ friendship_id: "f-2", status: "requested", requested_by_me: true }),
    ],
  });

  const ids = selectIncomingRequests(useFriendsStore.getState()).map((f) => f.friendship_id);

  expect(ids).toEqual(["f-1"]);
});

test("selectOutgoingRequests returns only requested + by-me", () => {
  useFriendsStore.getState().hydrate({
    accepted: [],
    incoming: [
      mkFriend({ friendship_id: "f-1", status: "requested", requested_by_me: true }),
      mkFriend({ friendship_id: "f-2", status: "requested", requested_by_me: false }),
    ],
  });

  const ids = selectOutgoingRequests(useFriendsStore.getState()).map((f) => f.friendship_id);

  expect(ids).toEqual(["f-1"]);
});

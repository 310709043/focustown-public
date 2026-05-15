/**
 * presenceStore — local projection of street presence + delta application.
 *
 * Worth testing (each rule encodes a real behavior the WS handler depends on):
 * - hydrate replaces the user map
 * - offline / in_room departures remove the user
 * - on_street arrival for an unknown user requests a rehydrate (not invent)
 * - status-only update on a known user patches without dropping fields
 * - equipment_changed sets pendingRehydrate regardless of state
 *
 * NOT worth testing:
 * - onStreet() — trivial Object.values projection
 */
import { beforeEach, expect, test } from "vitest";
import type { StreetUser } from "@/lib/api/types.gen";
import { usePresenceStore } from "@/lib/state/presenceStore";

const alice: StreetUser = {
  id: "u-alice",
  display_name: "Alice",
  character_key: null,
  status: "focused",
  vehicle: null,
};

beforeEach(() => {
  usePresenceStore.setState({ byId: {}, pendingRehydrate: false });
});

test("hydrate replaces the map and clears pendingRehydrate", () => {
  usePresenceStore.setState({ pendingRehydrate: true });
  usePresenceStore.getState().hydrate([alice]);
  expect(usePresenceStore.getState().byId).toEqual({ "u-alice": alice });
  expect(usePresenceStore.getState().pendingRehydrate).toBe(false);
});

test("offline state removes the user", () => {
  usePresenceStore.getState().hydrate([alice]);
  usePresenceStore.getState().applyDelta({ user_id: "u-alice", state: "offline" });
  expect(usePresenceStore.getState().byId).toEqual({});
});

test("in_room state removes the user from the street", () => {
  usePresenceStore.getState().hydrate([alice]);
  usePresenceStore.getState().applyDelta({ user_id: "u-alice", state: "in_room" });
  expect(usePresenceStore.getState().byId).toEqual({});
});

test("on_street arrival for an unknown user requests rehydrate", () => {
  usePresenceStore.getState().applyDelta({ user_id: "u-bob", state: "on_street" });
  expect(usePresenceStore.getState().pendingRehydrate).toBe(true);
});

test("status-only update patches without dropping fields", () => {
  usePresenceStore.getState().hydrate([alice]);
  usePresenceStore.getState().applyDelta({ user_id: "u-alice", status: "idle" });
  const patched = usePresenceStore.getState().byId["u-alice"];
  expect(patched.status).toBe("idle");
  expect(patched.display_name).toBe("Alice");
});

test("equipment_changed flips pendingRehydrate", () => {
  usePresenceStore.getState().applyDelta({ user_id: "u-anyone", equipment_changed: true });
  expect(usePresenceStore.getState().pendingRehydrate).toBe(true);
});

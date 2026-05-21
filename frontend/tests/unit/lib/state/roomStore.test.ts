/**
 * roomStore — owner's room cache with optimistic update + revert.
 *
 * Worth testing:
 * - hydrate fetches and stores the room
 * - hydrate error path surfaces the message and clears loading
 * - update without a hydrated room throws (we won't blast a PATCH at /me/room without knowing what's there)
 * - update optimistically applies the patch, then reconciles to the server response on success
 * - update reverts to the pre-update room on server failure (revert is the safety net for "the server said no")
 * - reset clears state
 */
import { beforeEach, expect, test, vi } from "vitest";

import type { Room } from "@/lib/api/types.gen";

const getMine = vi.fn();
const updateMine = vi.fn();

vi.mock("@/lib/api/endpoints", () => ({
  roomApi: {
    getMine: (...args: unknown[]) => getMine(...args),
    updateMine: (...args: unknown[]) => updateMine(...args),
  },
}));

import { useRoomStore } from "@/lib/state/roomStore";

const baseRoom: Room = {
  id: "r-1",
  owner_user_id: "u-1",
  name: "Cozy",
  theme: "cafe",
  visibility: "public",
  max_visitors: 5,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

beforeEach(() => {
  useRoomStore.setState({ myRoom: null, loading: false, error: null });
  getMine.mockReset();
  updateMine.mockReset();
});

test("hydrate stores the fetched room and clears loading", async () => {
  getMine.mockResolvedValue(baseRoom);

  const room = await useRoomStore.getState().hydrate();

  expect(room).toBe(baseRoom);
  expect(useRoomStore.getState().myRoom).toBe(baseRoom);
  expect(useRoomStore.getState().loading).toBe(false);
});

test("hydrate surfaces the error message on failure", async () => {
  getMine.mockRejectedValue(new Error("network down"));

  await expect(useRoomStore.getState().hydrate()).rejects.toThrow(
    "network down",
  );

  expect(useRoomStore.getState().error).toBe("network down");
  expect(useRoomStore.getState().loading).toBe(false);
});

test("update without prior hydrate throws (won't blast unknown state)", async () => {
  await expect(
    useRoomStore.getState().update({ name: "X" }),
  ).rejects.toThrow("room_not_hydrated");
});

test("update applies patch optimistically and reconciles to server response", async () => {
  useRoomStore.setState({ myRoom: baseRoom });
  const fresh = { ...baseRoom, name: "Even Cozier", theme: "rain" as const };
  updateMine.mockResolvedValue(fresh);

  await useRoomStore.getState().update({ name: "Even Cozier", theme: "rain" });

  expect(useRoomStore.getState().myRoom).toEqual(fresh);
});

test("update reverts to the prior room on server failure", async () => {
  useRoomStore.setState({ myRoom: baseRoom });
  updateMine.mockRejectedValue(new Error("server said no"));

  await expect(
    useRoomStore.getState().update({ name: "X" }),
  ).rejects.toThrow("server said no");

  expect(useRoomStore.getState().myRoom).toBe(baseRoom);
  expect(useRoomStore.getState().error).toBe("server said no");
});

test("reset clears room, loading, and error", () => {
  useRoomStore.setState({
    myRoom: baseRoom,
    loading: true,
    error: "oops",
  });

  useRoomStore.getState().reset();

  expect(useRoomStore.getState().myRoom).toBeNull();
  expect(useRoomStore.getState().loading).toBe(false);
  expect(useRoomStore.getState().error).toBeNull();
});

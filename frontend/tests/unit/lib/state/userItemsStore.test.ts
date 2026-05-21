/**
 * userItemsStore — shop ownership cache.
 *
 * Worth testing: hydrate replaces, add merges, owns is fast lookup,
 * reset clears. These four rules drive the "已擁有" badge + buy gate.
 */
import { beforeEach, expect, test } from "vitest";

import type { UserItem } from "@/lib/api/types.gen";
import { useUserItemsStore } from "@/lib/state/userItemsStore";

const itemA: UserItem = {
  id: "ui-a",
  shop_item_id: "shop-a",
  acquired_via: "purchase",
  acquired_at: "2026-01-01T00:00:00Z",
};
const itemB: UserItem = { ...itemA, id: "ui-b", shop_item_id: "shop-b" };

beforeEach(() => {
  useUserItemsStore.setState({ byShopItemId: {} });
});

test("hydrate indexes items by shop_item_id", () => {
  useUserItemsStore.getState().hydrate([itemA, itemB]);

  expect(useUserItemsStore.getState().byShopItemId).toEqual({
    "shop-a": itemA,
    "shop-b": itemB,
  });
});

test("hydrate replaces existing entries (not merges)", () => {
  useUserItemsStore.getState().hydrate([itemA]);
  useUserItemsStore.getState().hydrate([itemB]);

  // Only itemB remains.
  expect(useUserItemsStore.getState().byShopItemId).toEqual({
    "shop-b": itemB,
  });
});

test("add inserts without dropping prior entries", () => {
  useUserItemsStore.getState().hydrate([itemA]);
  useUserItemsStore.getState().add(itemB);

  expect(Object.keys(useUserItemsStore.getState().byShopItemId).sort()).toEqual([
    "shop-a",
    "shop-b",
  ]);
});

test("owns returns true for a known shop_item_id", () => {
  useUserItemsStore.getState().hydrate([itemA]);

  expect(useUserItemsStore.getState().owns("shop-a")).toBe(true);
});

test("owns returns false for an unknown shop_item_id", () => {
  expect(useUserItemsStore.getState().owns("missing")).toBe(false);
});

test("reset clears every entry", () => {
  useUserItemsStore.getState().hydrate([itemA, itemB]);
  useUserItemsStore.getState().reset();

  expect(useUserItemsStore.getState().byShopItemId).toEqual({});
});

"use client";

import { create } from "zustand";
import type { UserItem } from "../api/types.gen";

/**
 * Tracks which shop items the current user owns. The shop UI consults this
 * to render "已擁有" badges and disable the buy button.
 */

interface UserItemsStore {
  byShopItemId: Record<string, UserItem>;
  hydrate: (items: UserItem[]) => void;
  add: (item: UserItem) => void;
  owns: (shopItemId: string) => boolean;
  reset: () => void;
}

export const useUserItemsStore = create<UserItemsStore>((set, get) => ({
  byShopItemId: {},

  hydrate(items) {
    const next: Record<string, UserItem> = {};
    for (const it of items) next[it.shop_item_id] = it;
    set({ byShopItemId: next });
  },

  add(item) {
    set((prev) => ({
      byShopItemId: { ...prev.byShopItemId, [item.shop_item_id]: item },
    }));
  },

  owns(shopItemId) {
    return shopItemId in get().byShopItemId;
  },

  reset() {
    set({ byShopItemId: {} });
  },
}));

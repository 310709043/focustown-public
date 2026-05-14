"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { decorationApi, shopApi } from "@/lib/api/endpoints";
import type { RoomItem, ShopItem } from "@/lib/api/types.gen";
import { useUserItemsStore } from "@/lib/state/userItemsStore";
import { DecorationItem } from "./DecorationItem";
import { DecorationToolbar } from "./DecorationToolbar";

/**
 * Phase 5 — orchestrates decoration state for a single room.
 *
 * SRP: this is the smart container. It owns the canonical `items` array,
 * runs optimistic updates + rollback against `decorationApi`, and decides
 * whether the toolbar / drag affordances are interactive. The pure-UI
 * pieces (DecorationItem, DecorationToolbar) own zero network state and
 * receive callbacks for every mutation.
 *
 * State is intentionally local to the canvas — DecorationCanvas instances
 * are short-lived (one per /town/room/[id] mount) so there's nothing to
 * lift into a Zustand store yet. The optimistic-with-rollback pattern
 * mirrors `roomStore.update` in `lib/state/roomStore.ts`.
 */

type Props = {
  isOwner: boolean;
  roomId: string;
};

const PLACE_DEFAULT_XY = { x: 50, y: 50 };

export function DecorationCanvas({ isOwner, roomId }: Props) {
  const [items, setItems] = useState<RoomItem[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [iconCatalog, setIconCatalog] = useState<Record<string, string>>({});
  const owned = useUserItemsStore((s) => s.byShopItemId);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await decorationApi.list(roomId);
        if (!cancelled) setItems(list);
      } catch {
        // Empty room is the only fallback that's safe for both owner
        // and visitor; surfacing a banner here would compete with the
        // theme toolbar for the bottom-right slot.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  // Resolve user_item_id → icon for every placed item. We need the shop
  // catalog because UserItem.id → shop_item_id, and the icon lives on
  // ShopItem. Owner-side lookup is cheap (we already cache owned items);
  // visitor-side requires fetching the catalog once.
  useEffect(() => {
    let cancelled = false;
    if (items.length === 0) return;
    (async () => {
      try {
        const catalog: ShopItem[] = await shopApi.list();
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const s of catalog) next[s.id] = s.icon;
        setIconCatalog(next);
      } catch {
        // Falls back to "?" placeholder; rare in normal flow because
        // /shop/list is unauthenticated.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [items.length]);

  function iconFor(item: RoomItem): string {
    // Owner-only fast path: if we have the user_item in store, look up
    // its shop_item_id and then its icon in the catalog.
    const userItem = Object.values(owned).find((u) => u.id === item.user_item_id);
    if (userItem) {
      const icon = iconCatalog[userItem.shop_item_id];
      if (icon) return icon;
    }
    // Visitor path: the user_item isn't in our store (visitor doesn't own
    // it), so we can't join via the store. The shop catalog is keyed by
    // shop_item_id, not user_item_id — so we don't have a direct lookup.
    // A future API can expose `RoomItem.icon` directly; for now we show
    // a neutral placeholder.
    return "❓";
  }

  async function handlePlace(userItemId: string) {
    try {
      const placed = await decorationApi.place({
        user_item_id: userItemId,
        ...PLACE_DEFAULT_XY,
      });
      setItems((prev) => [...prev, placed]);
    } catch (err) {
      // Most likely "user_item_not_owned" or "out_of_range" — the catch
      // is a no-op (no toast infrastructure in this stint); the click
      // simply doesn't produce an item. A visible error path lands in a
      // later stint with the toast system.
      if (!(err instanceof ApiError)) throw err;
    }
  }

  async function handleMove(itemId: string, x: number, y: number) {
    const previous = items;
    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, x, y } : it)),
    );
    setPendingId(itemId);
    try {
      const fresh = await decorationApi.move(itemId, { x, y });
      setItems((prev) => prev.map((it) => (it.id === itemId ? fresh : it)));
    } catch {
      setItems(previous);
    } finally {
      setPendingId(null);
    }
  }

  async function handleRemove(itemId: string) {
    const previous = items;
    setItems((prev) => prev.filter((it) => it.id !== itemId));
    try {
      await decorationApi.remove(itemId);
    } catch {
      setItems(previous);
    }
  }

  return (
    <>
      {items.map((item) => (
        <DecorationItem
          key={item.id}
          item={item}
          icon={iconFor(item)}
          editable={isOwner && editMode}
          pending={pendingId === item.id}
          onMove={(x, y) => void handleMove(item.id, x, y)}
          onRemove={() => void handleRemove(item.id)}
        />
      ))}
      {isOwner && (
        <DecorationToolbar
          editMode={editMode}
          onToggle={() => setEditMode((v) => !v)}
          onPlace={handlePlace}
        />
      )}
    </>
  );
}

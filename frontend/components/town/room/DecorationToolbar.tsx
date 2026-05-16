"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { shopApi } from "@/lib/api/endpoints";
import type { ShopItem, UserItem } from "@/lib/api/types.gen";
import { useUserItemsStore } from "@/lib/state/userItemsStore";
import { BlinkDot } from "@/components/pixel/BlinkDot";

/**
 * Phase 5 — bottom-left palette + edit-mode toggle for room decoration.
 *
 * SRP: only handles the UI for switching between "view" and "edit" modes
 * and choosing which item to spawn. Spawning, dragging, and persistence
 * all live in DecorationCanvas / DecorationItem.
 *
 * The palette pulls owned items via useUserItemsStore (already hydrated
 * by /town) and joins them with the shop catalog (one-shot fetch on
 * first edit-mode entry) to read icon + name. Category filter is
 * intentionally permissive for now — any owned item can be placed; a
 * future seed migration may introduce a dedicated "decoration" category
 * to narrow this.
 */

type PaletteEntry = {
  userItem: UserItem;
  shopItem: ShopItem;
};

type Props = {
  editMode: boolean;
  onToggle: () => void;
  onPlace: (userItemId: string) => void | Promise<void>;
};

export function DecorationToolbar({ editMode, onToggle, onPlace }: Props) {
  const owned = useUserItemsStore((s) => s.byShopItemId);
  const [catalog, setCatalog] = useState<ShopItem[] | null>(null);
  const [catalogError, setCatalogError] = useState(false);
  const t = useTranslations("town.room.decoration");

  useEffect(() => {
    if (!editMode || catalog !== null || catalogError) return;
    let cancelled = false;
    void shopApi
      .list()
      .then((items) => {
        if (!cancelled) setCatalog(items);
      })
      .catch(() => {
        if (!cancelled) setCatalogError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [editMode, catalog, catalogError]);

  const entries: PaletteEntry[] = catalog
    ? Object.values(owned)
        .map((ui) => {
          const shopItem = catalog.find((s) => s.id === ui.shop_item_id);
          return shopItem ? { userItem: ui, shopItem } : null;
        })
        .filter((x): x is PaletteEntry => x !== null)
        // Cars belong on the street, not inside a room.
        .filter((e) => e.shopItem.category !== "car")
    : [];

  return (
    <div
      className="pixel-panel absolute z-10"
      style={{
        left: 24,
        bottom: 24,
        padding: editMode ? "10px 12px" : "6px 12px",
        maxWidth: 280,
      }}
    >
      <div className="flex items-center justify-between" style={{ gap: 12 }}>
        <span
          className="font-silkscreen"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 9,
            color: "var(--ink-mute)",
            letterSpacing: "0.2em",
          }}
        >
          <BlinkDot color="var(--amber)" />
          {editMode ? t("modeEditing") : t("modeDecorate")}
        </span>
        <button
          type="button"
          onClick={onToggle}
          className="pixel-btn"
          style={{ padding: "4px 10px", fontSize: 10 }}
        >
          {editMode ? t("doneCta") : t("editCta")}
        </button>
      </div>

      {editMode && (
        <div style={{ marginTop: 8 }}>
          {catalog === null && !catalogError && (
            <div
              className="font-silkscreen"
              style={{
                fontSize: 10,
                color: "var(--ink-mute)",
                padding: "6px 0",
                letterSpacing: "0.1em",
              }}
            >
              {t("loading")}
            </div>
          )}
          {catalogError && (
            <div
              className="font-silkscreen"
              style={{
                fontSize: 10,
                color: "var(--coral)",
                padding: "6px 0",
                letterSpacing: "0.1em",
              }}
            >
              {t("loadFailed")}
            </div>
          )}
          {catalog !== null && !catalogError && entries.length === 0 && (
            <div
              className="font-silkscreen"
              style={{
                fontSize: 10,
                color: "var(--ink-mute)",
                lineHeight: 1.7,
                letterSpacing: "0.05em",
              }}
            >
              {t("emptyLine1")}
              <br />
              {t("emptyLine2")}
            </div>
          )}
          {entries.length > 0 && (
            <div
              className="grid"
              style={{
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 6,
                marginTop: 2,
              }}
            >
              {entries.map(({ userItem, shopItem }) => (
                <button
                  key={userItem.id}
                  type="button"
                  title={shopItem.name}
                  onClick={() => void onPlace(userItem.id)}
                  className="pixel-btn"
                  style={{
                    width: 40,
                    height: 40,
                    padding: 0,
                    fontSize: 20,
                    lineHeight: 1,
                  }}
                >
                  {shopItem.icon}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

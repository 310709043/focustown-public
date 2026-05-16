"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import {
  CategorySection,
  type ShopCategoryKey,
} from "@/components/shop/CategorySection";
import { type FlashState } from "@/components/shop/ShopItemCard";
import { SubscriptionPanel } from "@/components/shop/SubscriptionPanel";
import {
  equipmentApi,
  purchaseApi,
  shopApi,
  userItemsApi,
  walletApi,
} from "@/lib/api/endpoints";
import type { ShopItem, ShopItemPrice } from "@/lib/api/types.gen";
import { useAuthStore } from "@/lib/state/authStore";
import { useWalletStore } from "@/lib/state/walletStore";
import { useUserItemsStore } from "@/lib/state/userItemsStore";

type SectionDef = {
  category: ShopCategoryKey;
  headingColor: string;
};

const SECTIONS: SectionDef[] = [
  { category: "car", headingColor: "var(--accent)" },
  { category: "scene", headingColor: "var(--teal)" },
  { category: "effect", headingColor: "var(--amber)" },
];

function priceFor(prices: ShopItemPrice[], code: string): ShopItemPrice | null {
  return prices.find((p) => p.currency_code === code) ?? null;
}

/**
 * Shop body (chromeless). Hosts the data fetch + purchase/equip handlers
 * and renders the subscription tier + catalogue sections in pixel-UI
 * primitives. The /shop route wraps this in <ShopScene> for the full-bleed
 * top-bar chrome; <ShopModal> reuses it inside its own modal panel.
 */
export function ShopView() {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [flash, setFlash] = useState<Record<string, FlashState>>({});
  const tBalance = useWalletStore((s) => s.balanceMinor("T"));
  const owns = useUserItemsStore((s) => s.byShopItemId);
  const equippedVehicleId = useAuthStore(
    (s) => s.user?.equipped_vehicle_item_id ?? null,
  );
  const setEquippedVehicle = useAuthStore((s) => s.setEquippedVehicle);
  const tPage = useTranslations("shop.page");
  const tErr = useTranslations("shop.errors");

  useEffect(() => {
    void Promise.all([
      shopApi.list().then(setItems),
      walletApi.list().then((ws) => useWalletStore.getState().hydrate(ws)),
      userItemsApi.list().then((is) => useUserItemsStore.getState().hydrate(is)),
    ]).catch(() => {});
  }, []);

  async function handleBuy(item: ShopItem) {
    if (pendingId || owns[item.id]) return;
    const price = priceFor(item.prices, "T");
    if (!price) {
      setFlash((f) => ({
        ...f,
        [item.id]: { kind: "err", msg: tErr("unavailable") },
      }));
      return;
    }
    if (tBalance < price.amount_minor) {
      setFlash((f) => ({
        ...f,
        [item.id]: { kind: "err", msg: tErr("insufficient") },
      }));
      window.setTimeout(
        () => setFlash((f) => ({ ...f, [item.id]: { kind: "idle" } })),
        1800,
      );
      return;
    }
    setPendingId(item.id);
    try {
      const res = await purchaseApi.buy(item.id, "T");
      useWalletStore
        .getState()
        .setBalance(res.currency_code, res.new_balance_minor);
      useUserItemsStore.getState().add({
        id: res.transaction_id,
        shop_item_id: res.item_id,
        acquired_via: "purchase",
        acquired_at: res.acquired_at,
      });
      setFlash((f) => ({
        ...f,
        [item.id]: { kind: "ok", key: Date.now() },
      }));
      window.setTimeout(
        () => setFlash((f) => ({ ...f, [item.id]: { kind: "idle" } })),
        900,
      );
    } catch (e) {
      const msg = (e as Error).message;
      const friendly = msg.includes("insufficient")
        ? tErr("insufficient")
        : msg.includes("already_owned")
          ? tErr("alreadyOwned")
          : msg.includes("price_not_available")
            ? tErr("unavailable")
            : tErr("purchaseFailed");
      setFlash((f) => ({
        ...f,
        [item.id]: { kind: "err", msg: friendly },
      }));
      window.setTimeout(
        () => setFlash((f) => ({ ...f, [item.id]: { kind: "idle" } })),
        1800,
      );
    } finally {
      setPendingId(null);
    }
  }

  async function handleEquipToggle(item: ShopItem) {
    if (pendingId) return;
    const isEquipped = equippedVehicleId === item.id;
    setPendingId(item.id);
    try {
      const target = isEquipped ? null : item.id;
      const res = await equipmentApi.setVehicle(target);
      setEquippedVehicle(res.equipped_vehicle_item_id, res.equipped_vehicle);
      setFlash((f) => ({
        ...f,
        [item.id]: { kind: "ok", key: Date.now() },
      }));
      window.setTimeout(
        () => setFlash((f) => ({ ...f, [item.id]: { kind: "idle" } })),
        900,
      );
    } catch (e) {
      const msg = (e as Error).message;
      const friendly = msg.includes("not_owned")
        ? tErr("notOwned")
        : msg.includes("not_a_vehicle")
          ? tErr("notAVehicle")
          : tErr("equipFailed");
      setFlash((f) => ({
        ...f,
        [item.id]: { kind: "err", msg: friendly },
      }));
      window.setTimeout(
        () => setFlash((f) => ({ ...f, [item.id]: { kind: "idle" } })),
        1800,
      );
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div
      data-testid="shop-view"
      style={{ display: "flex", flexDirection: "column", gap: 13 }}
    >
      <SubscriptionPanel />

      {SECTIONS.map(({ category, headingColor }) => (
        <CategorySection
          key={category}
          category={category}
          headingColor={headingColor}
          items={items.filter((i) => i.category === category)}
          ownsMap={owns}
          equippedVehicleId={equippedVehicleId}
          pendingId={pendingId}
          flash={flash}
          tBalance={tBalance}
          onBuy={handleBuy}
          onEquipToggle={handleEquipToggle}
        />
      ))}

      {items.length === 0 ? (
        <div
          data-testid="shop-empty"
          className="font-silkscreen"
          style={{
            fontSize: 11,
            letterSpacing: "0.08em",
            color: "var(--ink-mute)",
            textAlign: "center",
            padding: "24px 0",
          }}
        >
          {tPage("emptyState")}
        </div>
      ) : null}
    </div>
  );
}

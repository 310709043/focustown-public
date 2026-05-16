"use client";

import { useTranslations } from "next-intl";

import { BlinkDot } from "@/components/pixel/BlinkDot";
import type { ShopItem } from "@/lib/api/types.gen";

import { ShopItemCard, type FlashState } from "./ShopItemCard";

export type ShopCategoryKey = "car" | "scene" | "effect";

const TITLE_KEY: Record<ShopCategoryKey, "carSkin" | "sceneSkin" | "effects"> = {
  car: "carSkin",
  scene: "sceneSkin",
  effect: "effects",
};

/**
 * Reusable shop section: pixel-panel + BlinkDot heading + responsive grid
 * of ShopItemCards. One instance per catalogue category.
 */
export function CategorySection({
  category,
  headingColor,
  items,
  ownsMap,
  equippedVehicleId,
  pendingId,
  flash,
  tBalance,
  onBuy,
  onEquipToggle,
}: {
  category: ShopCategoryKey;
  headingColor: string;
  items: ShopItem[];
  ownsMap: Record<string, unknown>;
  equippedVehicleId: string | null;
  pendingId: string | null;
  flash: Record<string, FlashState>;
  tBalance: number;
  onBuy: (item: ShopItem) => void;
  onEquipToggle: (item: ShopItem) => void;
}) {
  const tSection = useTranslations("shop.section");

  if (items.length === 0) return null;

  return (
    <section
      data-testid={`shop-section-${category}`}
      className="pixel-panel"
      style={{
        padding: "15px 17px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <h3
        className="font-silkscreen"
        style={{
          fontSize: 10,
          letterSpacing: "0.1em",
          color: headingColor,
          textShadow: `0 0 8px ${headingColor}`,
          margin: 0,
          display: "flex",
          alignItems: "center",
        }}
      >
        <BlinkDot color={headingColor} marginRight={6} />
        {tSection(TITLE_KEY[category])}
      </h3>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 10,
        }}
      >
        {items.map((item) => {
          const owned = !!ownsMap[item.id];
          const tPrice = item.prices.find((p) => p.currency_code === "T");
          const canAfford = tPrice ? tBalance >= tPrice.amount_minor : false;
          return (
            <ShopItemCard
              key={item.id}
              item={item}
              owned={owned}
              isEquipped={equippedVehicleId === item.id}
              isLoading={pendingId === item.id}
              canAfford={canAfford}
              flash={flash[item.id] ?? { kind: "idle" }}
              onBuy={onBuy}
              onEquipToggle={onEquipToggle}
            />
          );
        })}
      </div>
    </section>
  );
}

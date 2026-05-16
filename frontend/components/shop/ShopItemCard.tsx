"use client";

import { useTranslations } from "next-intl";

import { BlinkDot } from "@/components/pixel/BlinkDot";
import { CornerDeco } from "@/components/login/CornerDeco";
import type { ShopItem, ShopItemPrice } from "@/lib/api/types.gen";
import { formatMinor } from "@/lib/state/walletStore";

export type FlashState =
  | { kind: "idle" }
  | { kind: "ok"; key: number }
  | { kind: "err"; msg: string };

function priceFor(prices: ShopItemPrice[], code: string): ShopItemPrice | null {
  return prices.find((p) => p.currency_code === code) ?? null;
}

export function ShopItemCard({
  item,
  owned,
  isEquipped,
  isLoading,
  canAfford,
  flash,
  onBuy,
  onEquipToggle,
}: {
  item: ShopItem;
  owned: boolean;
  isEquipped: boolean;
  isLoading: boolean;
  canAfford: boolean;
  flash: FlashState;
  onBuy: (item: ShopItem) => void;
  onEquipToggle: (item: ShopItem) => void;
}) {
  const tItem = useTranslations("shop.item");
  const tPrice = priceFor(item.prices, "T");
  const isVehicle = item.category === "car";
  const showEquipToggle = owned && isVehicle;

  return (
    <article
      data-testid="shop-item-card"
      data-owned={owned ? "true" : "false"}
      data-featured={item.featured ? "true" : "false"}
      className="pixel-panel"
      style={{
        position: "relative",
        padding: "12px 13px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        transition: "transform 0.12s ease",
        background: owned
          ? "rgba(52,211,153,0.05)"
          : item.featured
            ? "rgba(244,114,182,0.05)"
            : undefined,
      }}
    >
      {item.featured ? <CornerDeco color="var(--accent-2)" /> : null}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span
          aria-hidden
          style={{
            fontSize: 24,
            width: 36,
            height: 36,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--bg)",
            border: "1px solid var(--panel-stroke)",
            borderRadius: 2,
            flexShrink: 0,
          }}
        >
          {item.icon}
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
          <span
            className="font-silkscreen"
            style={{
              fontSize: 11,
              letterSpacing: "0.06em",
              color: "var(--ink)",
              lineHeight: 1.25,
            }}
          >
            {item.name}
          </span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {item.featured ? (
              <span
                className="font-silkscreen"
                style={{
                  fontSize: 8,
                  letterSpacing: "0.1em",
                  color: "var(--accent-2)",
                  border: "1px solid var(--accent-2)",
                  padding: "1px 6px",
                  borderRadius: 2,
                  textShadow: "0 0 5px var(--accent-2)",
                }}
              >
                <BlinkDot color="var(--accent-2)" marginRight={4} size={4} />
                {tItem("featuredBadge")}
              </span>
            ) : null}
            {owned ? (
              <span
                className="font-silkscreen"
                style={{
                  fontSize: 8,
                  letterSpacing: "0.1em",
                  color: "var(--teal)",
                  border: "1px solid var(--teal)",
                  padding: "1px 6px",
                  borderRadius: 2,
                  textShadow: "0 0 5px var(--teal)",
                }}
              >
                {tItem("ownedBadge")}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <p
        style={{
          margin: 0,
          fontSize: 11,
          color: "var(--ink-mute)",
          lineHeight: 1.35,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {item.description}
      </p>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginTop: "auto",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "baseline",
            gap: 4,
            color: tPrice ? "var(--amber)" : "var(--ink-dim)",
            textShadow: tPrice ? "0 0 6px rgba(252,211,77,0.4)" : undefined,
          }}
        >
          <span aria-hidden style={{ fontSize: 11 }}>💰</span>
          <span
            style={{
              fontFamily: "var(--font-vt323), monospace",
              fontSize: 14,
              letterSpacing: 0.4,
            }}
          >
            {tPrice ? formatMinor("T", tPrice.amount_minor) : "—"}
          </span>
          {tPrice ? (
            <span className="font-silkscreen" style={{ fontSize: 8 }}>
              T
            </span>
          ) : null}
        </span>

        {showEquipToggle ? (
          <button
            type="button"
            onClick={() => onEquipToggle(item)}
            disabled={isLoading}
            className={isEquipped ? "pixel-btn" : "pixel-btn primary"}
            style={{ fontSize: 9, padding: "5px 10px" }}
            title={
              isEquipped
                ? tItem("equipTooltipUnequip")
                : tItem("equipTooltipEquip")
            }
          >
            {isLoading
              ? tItem("buyLoading")
              : isEquipped
                ? tItem("equippedCta")
                : tItem("equipCta")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onBuy(item)}
            disabled={owned || isLoading || !tPrice || !canAfford}
            className="pixel-btn primary"
            style={{ fontSize: 9, padding: "5px 10px" }}
            title={
              owned
                ? tItem("buyTooltipOwned")
                : !canAfford
                  ? tItem("buyTooltipInsufficient")
                  : tItem("buyTooltipBuy")
            }
          >
            {owned
              ? tItem("ownedBadge")
              : isLoading
                ? tItem("buyLoading")
                : tItem("buyCta")}
          </button>
        )}
      </div>

      {flash.kind === "ok" ? (
        <span
          key={flash.key}
          className="animate-coinPop"
          style={{
            position: "absolute",
            right: 10,
            bottom: 34,
            pointerEvents: "none",
            fontFamily: "var(--font-vt323), monospace",
            color: "var(--amber)",
            fontSize: 18,
            textShadow:
              "0 0 10px var(--amber), 0 0 18px rgba(252,211,77,0.5)",
          }}
        >
          {showEquipToggle
            ? tItem("successEquip")
            : tItem("successOwn")}
        </span>
      ) : null}
      {flash.kind === "err" ? (
        <span
          style={{
            position: "absolute",
            right: 10,
            bottom: 34,
            pointerEvents: "none",
            fontFamily: "var(--font-vt323), monospace",
            color: "var(--coral)",
            fontSize: 14,
            textShadow: "0 0 8px var(--coral)",
          }}
        >
          {tItem("errorPrefix")} {flash.msg}
        </span>
      ) : null}
    </article>
  );
}

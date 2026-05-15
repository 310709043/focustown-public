"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { clsx } from "clsx";

import { useRouter } from "@/i18n/routing";
import {
  equipmentApi,
  purchaseApi,
  shopApi,
  userItemsApi,
  walletApi,
} from "@/lib/api/endpoints";
import type { ShopItem, ShopItemPrice } from "@/lib/api/types.gen";
import { useAuthStore } from "@/lib/state/authStore";
import { formatMinor, useWalletStore } from "@/lib/state/walletStore";
import { useUserItemsStore } from "@/lib/state/userItemsStore";

type SectionDef = {
  category: "car" | "scene" | "effect";
  titleKey: "carSkin" | "sceneSkin" | "effects";
};

const SECTIONS: SectionDef[] = [
  { category: "car", titleKey: "carSkin" },
  { category: "scene", titleKey: "sceneSkin" },
  { category: "effect", titleKey: "effects" },
];

function priceFor(prices: ShopItemPrice[], code: string): ShopItemPrice | null {
  return prices.find((p) => p.currency_code === code) ?? null;
}

type FlashState =
  | { kind: "idle" }
  | { kind: "ok"; key: number }
  | { kind: "err"; msg: string };

export default function ShopPage() {
  const router = useRouter();
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
  const tSection = useTranslations("shop.section");
  const tItem = useTranslations("shop.item");
  const tErr = useTranslations("shop.errors");

  const featureBullets: string[] = tPage.raw("subscriptionFeatures") as string[];

  useEffect(() => {
    // Hydrate everything the shop needs in one shot — even if the user
    // navigated here without going through /town first.
    void Promise.all([
      shopApi.list().then(setItems),
      walletApi.list().then((ws) => useWalletStore.getState().hydrate(ws)),
      userItemsApi.list().then((is) => useUserItemsStore.getState().hydrate(is)),
    ]).catch(() => {});
  }, []);

  const byCategory = (cat: string) => items.filter((i) => i.category === cat);

  async function handleBuy(item: ShopItem) {
    if (pendingId || owns[item.id]) return;
    const price = priceFor(item.prices, "T");
    if (!price) {
      setFlash((f) => ({ ...f, [item.id]: { kind: "err", msg: tErr("unavailable") } }));
      return;
    }
    if (tBalance < price.amount_minor) {
      setFlash((f) => ({ ...f, [item.id]: { kind: "err", msg: tErr("insufficient") } }));
      window.setTimeout(
        () => setFlash((f) => ({ ...f, [item.id]: { kind: "idle" } })),
        1800,
      );
      return;
    }
    setPendingId(item.id);
    try {
      const res = await purchaseApi.buy(item.id, "T");
      // Optimistic-but-confirmed update: server told us the new balance.
      useWalletStore.getState().setBalance(res.currency_code, res.new_balance_minor);
      useUserItemsStore.getState().add({
        id: res.transaction_id,
        shop_item_id: res.item_id,
        acquired_via: "purchase",
        acquired_at: res.acquired_at,
      });
      setFlash((f) => ({ ...f, [item.id]: { kind: "ok", key: Date.now() } }));
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
      setFlash((f) => ({ ...f, [item.id]: { kind: "err", msg: friendly } }));
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
      setFlash((f) => ({ ...f, [item.id]: { kind: "ok", key: Date.now() } }));
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
      setFlash((f) => ({ ...f, [item.id]: { kind: "err", msg: friendly } }));
      window.setTimeout(
        () => setFlash((f) => ({ ...f, [item.id]: { kind: "idle" } })),
        1800,
      );
    } finally {
      setPendingId(null);
    }
  }

  return (
    <main
      className="absolute inset-0 flex flex-col overflow-hidden"
      style={{ background: "linear-gradient(135deg,#04011a,#090230,#04011a)" }}
    >
      <header className="h-[46px] bg-[rgba(3,1,17,.96)] border-b border-border flex items-center justify-between px-4">
        <div
          className="font-pixel text-[9px] tracking-widest"
          style={{ color: "var(--pink)", textShadow: "0 0 10px var(--pink)" }}
        >
          {tPage("title")}
        </div>
        <div className="flex items-center gap-3">
          <span
            style={{
              background: "rgba(252,211,77,0.07)",
              border: "1px solid rgba(252,211,77,0.45)",
              color: "var(--amber)",
              fontFamily: "VT323, monospace",
              letterSpacing: 0.6,
              textShadow: "0 0 6px rgba(252,211,77,0.5)",
              fontSize: 13,
              padding: "4px 10px",
              borderRadius: 6,
            }}
            title={tPage("coinTooltip")}
          >
            💰 {formatMinor("T", tBalance)} T
          </span>
          <button
            onClick={() => router.push("/town")}
            className="border border-border text-muted font-japan text-[10px] px-3 py-1.5 touch:py-2.5 touch:min-h-[40px] rounded hover:border-coral hover:text-coral active:border-coral active:text-coral"
          >
            {tPage("closeCta")}
          </button>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="text-[10px] text-muted mb-1">{tPage("subscriptionTitle")}</div>
        <div className="pixel-panel p-5 flex flex-col gap-2 mb-4">
          <div className="flex justify-between items-start">
            <div
              className="font-pixel text-[9px]"
              style={{ color: "var(--a2)", textShadow: "0 0 8px var(--a1)" }}
            >
              {tPage("subscriptionBadge")}
            </div>
            <div className="text-[14px] text-amber font-medium">
              {tPage("subscriptionPrice")}
              <span className="text-[11px] text-muted">{tPage("subscriptionPriceSuffix")}</span>
            </div>
          </div>
          <ul className="flex flex-col gap-1.5 text-[11px]">
            {featureBullets.map((line) => (
              <li
                key={line}
                className="before:content-['✓'] before:text-teal before:mr-2"
              >
                {line}
              </li>
            ))}
          </ul>
          <button
            disabled
            className="font-pixel text-[8px] py-3 rounded bg-gradient-to-br from-accent-3 to-accent-4 text-accent-2 tracking-wider opacity-60 cursor-not-allowed"
            title={tPage("subscriptionCtaTooltip")}
          >
            {tPage("subscriptionCta")}
          </button>
        </div>

        {SECTIONS.map(({ category, titleKey }) => {
          const list = byCategory(category);
          if (!list.length) return null;
          return (
            <div key={category}>
              <div className="text-[10px] text-muted my-3 tracking-wide">{tSection(titleKey)}</div>
              <div className="grid grid-cols-2 gap-2 mb-1">
                {list.map((it) => {
                  const tPrice = priceFor(it.prices, "T");
                  const owned = !!owns[it.id];
                  const isLoading = pendingId === it.id;
                  const state = flash[it.id] ?? { kind: "idle" as const };
                  const canAfford = tPrice ? tBalance >= tPrice.amount_minor : false;
                  return (
                    <div
                      key={it.id}
                      className={clsx(
                        "pixel-panel p-3 flex flex-col gap-1.5 transition-all relative",
                        !owned && "hover:-translate-y-0.5 touch:active:scale-[0.98]",
                      )}
                      style={
                        owned
                          ? {
                              boxShadow:
                                "0 0 0 2px var(--bg), 0 0 0 3px var(--teal), 0 12px 30px rgba(0,0,0,0.6)",
                              background: "rgba(52,211,153,0.05)",
                            }
                          : it.featured
                            ? {
                                boxShadow:
                                  "0 0 0 2px var(--bg), 0 0 0 3px var(--pink), 0 12px 30px rgba(0,0,0,0.6)",
                                background: "rgba(244,114,182,0.05)",
                              }
                            : undefined
                      }
                    >
                      <div className="text-2xl">{it.icon}</div>
                      <div className="text-[12px] flex items-center gap-1.5 flex-wrap">
                        {it.name}
                        {it.featured ? (
                          <span className="text-[10px] text-pink">{tItem("featuredBadge")}</span>
                        ) : null}
                        {owned ? (
                          <span
                            className="text-[10px]"
                            style={{
                              color: "var(--teal)",
                              border: "1px solid rgba(52,211,153,0.5)",
                              padding: "0 4px",
                              borderRadius: 3,
                              fontFamily: "VT323, monospace",
                              letterSpacing: 0.5,
                            }}
                          >
                            {tItem("ownedBadge")}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[11px] text-muted leading-tight">{it.description}</div>
                      <div className="flex items-center justify-between mt-auto">
                        <span
                          className="text-[13px]"
                          style={{
                            color: tPrice ? "var(--amber)" : "var(--muted)",
                            fontFamily: "VT323, monospace",
                            letterSpacing: 0.5,
                            textShadow: tPrice ? "0 0 6px rgba(252,211,77,0.4)" : undefined,
                          }}
                        >
                          {tPrice ? `💰 ${formatMinor("T", tPrice.amount_minor)} T` : "—"}
                        </span>
                        {owned && it.category === "car" ? (
                          (() => {
                            const isEquipped = equippedVehicleId === it.id;
                            return (
                              <button
                                onClick={() => handleEquipToggle(it)}
                                disabled={isLoading}
                                className={clsx(
                                  "font-pixel text-[8px] px-2.5 py-1.5 touch:px-3 touch:py-2 touch:text-[10px] touch:min-h-[40px] rounded relative",
                                  isEquipped
                                    ? "border border-amber bg-amber/10 text-amber"
                                    : "border border-teal/60 text-teal hover:bg-teal/10 active:bg-teal/10",
                                )}
                                title={
                                  isEquipped
                                    ? tItem("equipTooltipUnequip")
                                    : tItem("equipTooltipEquip")
                                }
                                style={
                                  isEquipped
                                    ? { textShadow: "0 0 6px rgba(252,211,77,0.6)" }
                                    : undefined
                                }
                              >
                                {isLoading
                                  ? tItem("buyLoading")
                                  : isEquipped
                                    ? tItem("equippedCta")
                                    : tItem("equipCta")}
                              </button>
                            );
                          })()
                        ) : (
                          <button
                            onClick={() => handleBuy(it)}
                            disabled={owned || isLoading || !tPrice}
                            className={clsx(
                              "font-pixel text-[8px] px-2.5 py-1.5 touch:px-3 touch:py-2 touch:text-[10px] touch:min-h-[40px] rounded relative",
                              owned
                                ? "border border-teal/40 text-teal/70 cursor-not-allowed"
                                : !canAfford
                                  ? "border border-border text-muted cursor-not-allowed"
                                  : "border border-accent-1 text-accent-1 hover:bg-accent-1/10 active:bg-accent-1/10",
                            )}
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
                      {state.kind === "ok" ? (
                        <span
                          key={state.key}
                          className="absolute pointer-events-none animate-coinPop"
                          style={{
                            right: 8,
                            bottom: 26,
                            fontFamily: "VT323, monospace",
                            color: "var(--amber)",
                            fontSize: 18,
                            textShadow: "0 0 10px var(--amber), 0 0 18px rgba(252,211,77,0.5)",
                          }}
                        >
                          {owned && it.category === "car"
                            ? tItem("successEquip")
                            : tItem("successOwn")}
                        </span>
                      ) : null}
                      {state.kind === "err" ? (
                        <span
                          className="absolute pointer-events-none"
                          style={{
                            right: 8,
                            bottom: 26,
                            fontFamily: "VT323, monospace",
                            color: "var(--coral)",
                            fontSize: 14,
                            textShadow: "0 0 8px var(--coral)",
                          }}
                        >
                          {tItem("errorPrefix")} {state.msg}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {items.length === 0 ? (
          <div className="text-[11px] text-muted text-center mt-4">
            {tPage("emptyState")}
          </div>
        ) : null}
      </div>
    </main>
  );
}

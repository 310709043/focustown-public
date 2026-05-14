"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { purchaseApi, shopApi, userItemsApi, walletApi } from "@/lib/api/endpoints";
import type { ShopItem, ShopItemPrice } from "@/lib/api/types.gen";
import { formatMinor, useWalletStore } from "@/lib/state/walletStore";
import { useUserItemsStore } from "@/lib/state/userItemsStore";
import { clsx } from "clsx";

const SECTIONS: { title: string; category: string }[] = [
  { title: "🚗 車車外觀",  category: "car" },
  { title: "🌆 場景皮膚",  category: "scene" },
  { title: "✨ 特效道具",  category: "effect" },
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
      setFlash((f) => ({ ...f, [item.id]: { kind: "err", msg: "暫不可用" } }));
      return;
    }
    if (tBalance < price.amount_minor) {
      setFlash((f) => ({ ...f, [item.id]: { kind: "err", msg: "T 幣不足" } }));
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
      // Match backend error codes from FocusTownError envelope
      const msg = (e as Error).message;
      const friendly = msg.includes("insufficient")
        ? "T 幣不足"
        : msg.includes("already_owned")
          ? "已擁有"
          : msg.includes("price_not_available")
            ? "暫不可用"
            : "購買失敗";
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
          🛒 道具商店
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
            title="T 幣餘額"
          >
            💰 {formatMinor("T", tBalance)} T
          </span>
          <button
            onClick={() => router.push("/town")}
            className="border border-border text-muted font-japan text-[10px] px-3 py-1 rounded hover:border-coral hover:text-coral"
          >
            ✕ 關閉
          </button>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="text-[10px] text-muted mb-1">★ FOCUS+ 訂閱方案</div>
        <div className="bg-card border-[1.5px] border-accent-1 rounded-lg p-5 flex flex-col gap-2 mb-4">
          <div className="flex justify-between items-start">
            <div
              className="font-pixel text-[9px]"
              style={{ color: "var(--a2)", textShadow: "0 0 8px var(--a1)" }}
            >
              ✦ FOCUS+
            </div>
            <div className="text-[14px] text-amber font-medium">
              NT$129<span className="text-[11px] text-muted">/月</span>
            </div>
          </div>
          <ul className="flex flex-col gap-1.5 text-[11px]">
            <li className="before:content-['✓'] before:text-teal before:mr-2">無限配對 + 看誰喜歡你</li>
            <li className="before:content-['✓'] before:text-teal before:mr-2">共同專注室 + 即時聊天</li>
            <li className="before:content-['✓'] before:text-teal before:mr-2">AI 性格分析完整報告</li>
            <li className="before:content-['✓'] before:text-teal before:mr-2">大賞區特別光環效果</li>
            <li className="before:content-['✓'] before:text-teal before:mr-2">所有場景解鎖</li>
          </ul>
          <button
            disabled
            className="font-pixel text-[8px] py-3 rounded bg-gradient-to-br from-accent-3 to-accent-4 text-accent-2 tracking-wider opacity-60 cursor-not-allowed"
            title="Visa 串接於 Phase 10 啟用"
          >
            ★ 即將開放（Phase 10）
          </button>
        </div>

        {SECTIONS.map(({ title, category }) => {
          const list = byCategory(category);
          if (!list.length) return null;
          return (
            <div key={category}>
              <div className="text-[10px] text-muted my-3 tracking-wide">{title}</div>
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
                        "bg-card border rounded-lg p-3 flex flex-col gap-1.5 transition-all relative",
                        owned
                          ? "border-teal/40 bg-teal/5"
                          : it.featured
                            ? "border-pink bg-pink/5 hover:-translate-y-0.5"
                            : "border-border hover:-translate-y-0.5",
                      )}
                    >
                      <div className="text-2xl">{it.icon}</div>
                      <div className="text-[12px] flex items-center gap-1.5 flex-wrap">
                        {it.name}
                        {it.featured ? <span className="text-[10px] text-pink">熱門</span> : null}
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
                            ✓ 已擁有
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
                        <button
                          onClick={() => handleBuy(it)}
                          disabled={owned || isLoading || !tPrice}
                          className={clsx(
                            "font-pixel text-[8px] px-2.5 py-1 rounded relative",
                            owned
                              ? "border border-teal/40 text-teal/70 cursor-not-allowed"
                              : !canAfford
                                ? "border border-border text-muted cursor-not-allowed"
                                : "border border-accent-1 text-accent-1 hover:bg-accent-1/10",
                          )}
                          title={
                            owned
                              ? "已擁有"
                              : !canAfford
                                ? "T 幣不足"
                                : "用 T 幣購買"
                          }
                        >
                          {owned ? "已擁有" : isLoading ? "..." : "購買"}
                        </button>
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
                          ✦ 入手
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
                          ✕ {state.msg}
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
            尚未建立商品（後端 seeder 待加入）
          </div>
        ) : null}
      </div>
    </main>
  );
}

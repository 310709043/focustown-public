"use client";

import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/routing";
import { ShopView } from "@/components/views/ShopView";
import { formatMinor, useWalletStore } from "@/lib/state/walletStore";

export default function ShopPage() {
  const router = useRouter();
  const tBalance = useWalletStore((s) => s.balanceMinor("T"));
  const tPage = useTranslations("shop.page");

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
              fontFamily: "var(--font-vt323), monospace",
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
        <ShopView />
      </div>
    </main>
  );
}

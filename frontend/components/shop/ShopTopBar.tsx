"use client";

import { useTranslations } from "next-intl";

import { BlinkDot } from "@/components/pixel/BlinkDot";
import { useRouter } from "@/i18n/routing";
import { useWalletStore } from "@/lib/state/walletStore";

import { WalletBadge } from "./WalletBadge";

/**
 * 46 px top bar for /shop. Mirrors AwardsTopBar: BlinkDot + uppercase
 * silkscreen title (pink accent), wallet balance pill, pixel-btn close
 * routing back to /town.
 */
export function ShopTopBar() {
  const router = useRouter();
  const tTopBar = useTranslations("shop.topBar");
  const tPage = useTranslations("shop.page");
  const balanceMinor = useWalletStore((s) => s.balanceMinor("T"));

  return (
    <header
      data-testid="shop-top-bar"
      style={{
        height: 46,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 18px",
        background: "rgba(3,1,17,0.96)",
        borderBottom: "1px solid var(--panel-stroke)",
        flexShrink: 0,
      }}
    >
      <div
        className="font-silkscreen"
        style={{
          fontSize: 10,
          letterSpacing: "0.2em",
          color: "var(--pink)",
          textShadow: "0 0 10px var(--pink)",
          display: "flex",
          alignItems: "center",
        }}
      >
        <BlinkDot color="var(--pink)" marginRight={6} />
        {tTopBar("title")}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <WalletBadge balanceMinor={balanceMinor} />
        <button
          type="button"
          className="pixel-btn"
          style={{ fontSize: 10, padding: "6px 12px" }}
          onClick={() => router.push("/town")}
        >
          {tPage("closeCta")}
        </button>
      </div>
    </header>
  );
}

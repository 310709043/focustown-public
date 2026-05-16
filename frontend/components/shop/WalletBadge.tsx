"use client";

import { useTranslations } from "next-intl";

import { formatMinor } from "@/lib/state/walletStore";

/**
 * T-coin balance pill rendered in the /shop top bar. VT323 numeric, amber
 * accent + glow, silkscreen "T" suffix. Tooltip reuses the existing
 * `shop.page.coinTooltip` key.
 */
export function WalletBadge({ balanceMinor }: { balanceMinor: number }) {
  const tPage = useTranslations("shop.page");

  return (
    <span
      data-testid="shop-wallet-badge"
      title={tPage("coinTooltip")}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        border: "1px solid var(--panel-stroke)",
        background: "rgba(252,211,77,0.07)",
        borderRadius: 2,
        color: "var(--amber)",
        textShadow: "0 0 6px rgba(252,211,77,0.5)",
      }}
    >
      <span aria-hidden style={{ fontSize: 13 }}>💰</span>
      <span
        style={{
          fontFamily: "var(--font-vt323), monospace",
          fontSize: 14,
          letterSpacing: 0.6,
        }}
      >
        {formatMinor("T", balanceMinor)}
      </span>
      <span
        className="font-silkscreen"
        style={{ fontSize: 9, letterSpacing: "0.1em" }}
      >
        T
      </span>
    </span>
  );
}

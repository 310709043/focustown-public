"use client";

import { formatMinor, useWalletStore } from "@/lib/state/walletStore";

/**
 * T-coin balance pill for the town navbar. Amber neon to match the existing
 * pixel-city HUD aesthetic — the only place this color is reserved for, so
 * it reads instantly as "currency you can spend".
 *
 * Listens to `wallet.updated` via the store; the page-level subscriber
 * (`/town`) writes incoming WS payloads into the store.
 */
export function CoinBadge() {
  const balanceMinor = useWalletStore((s) => s.balanceMinor("T"));
  return (
    <span
      title={`T 幣餘額：${formatMinor("T", balanceMinor)} T`}
      style={{
        background: "rgba(252,211,77,0.07)",
        border: "1px solid rgba(252,211,77,0.45)",
        color: "var(--amber)",
        fontFamily: "VT323, monospace",
        letterSpacing: 0.6,
        textShadow: "0 0 6px rgba(252,211,77,0.55)",
        boxShadow: "inset 0 0 12px rgba(252,211,77,0.05)",
        fontSize: 12,
        padding: "5px 10px",
        borderRadius: 6,
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        lineHeight: 1,
      }}
    >
      <span style={{ fontSize: 13 }}>💰</span>
      <span>{formatMinor("T", balanceMinor)}</span>
      <span style={{ fontSize: 10, opacity: 0.7 }}>T</span>
    </span>
  );
}

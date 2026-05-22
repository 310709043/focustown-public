"use client";

import { useTranslations } from "next-intl";

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
  const t = useTranslations("town.coin");
  const formatted = formatMinor("T", balanceMinor);
  return (
    <span
      title={t("balanceTooltip", { amount: formatted })}
      style={{
        background: "rgba(252,211,77,0.07)",
        border: "1px solid rgba(252,211,77,0.45)",
        color: "var(--amber)",
        fontFamily: "var(--font-vt323), monospace",
        letterSpacing: 0.6,
        textShadow: "0 0 6px rgba(252,211,77,0.55)",
        boxShadow: "inset 0 0 12px rgba(252,211,77,0.05)",
        fontSize: 14,
        padding: "6px 12px",
        borderRadius: 6,
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        lineHeight: 1,
      }}
    >
      <span style={{ fontSize: 15 }}>💰</span>
      <span>{formatted}</span>
      <span style={{ fontSize: 12, opacity: 0.7 }}>{t("unit")}</span>
    </span>
  );
}

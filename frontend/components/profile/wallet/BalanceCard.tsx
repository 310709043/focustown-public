"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { useWalletStore } from "@/lib/state/walletStore";
import type { WalletTransaction } from "@/lib/api/types.gen";

interface BalanceCardProps {
  transactions: WalletTransaction[];
  loading: boolean;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function fromMinor(amountMinor: number): number {
  return Math.round(amountMinor / 100);
}

export function BalanceCard({ transactions, loading }: BalanceCardProps) {
  const t = useTranslations("profile.wallet");
  const balanceMinor = useWalletStore((s) => s.byCurrency.T ?? 0);
  const balance = fromMinor(balanceMinor);

  const { incoming, outgoing, net } = useMemo(() => {
    if (loading) return { incoming: 125, outgoing: 240, net: -135 };
    const cutoff = Date.now() - SEVEN_DAYS_MS;
    let inc = 0;
    let out = 0;
    for (const tx of transactions) {
      if (tx.currency_code !== "T") continue;
      const ts = Date.parse(tx.created_at);
      if (Number.isNaN(ts) || ts < cutoff) continue;
      const wholeT = fromMinor(Math.abs(tx.delta_minor));
      if (tx.delta_minor > 0) inc += wholeT;
      else out += wholeT;
    }
    return { incoming: inc, outgoing: out, net: inc - out };
  }, [transactions, loading]);

  return (
    <section
      data-testid="wallet-balance"
      style={{
        position: "relative",
        padding: "18px 22px",
        border: "1px solid #f59e0b",
        background:
          "linear-gradient(135deg, rgba(245,158,11,0.20) 0%, rgba(245,158,11,0.08) 60%, rgba(7,4,26,0.55) 100%)",
        boxShadow: "0 0 24px rgba(245,158,11,0.22) inset",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 18,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 56,
            height: 56,
            background: "rgba(245,158,11,0.25)",
            border: "2px solid #f59e0b",
            color: "#fbbf24",
            fontSize: 28,
            boxShadow: "0 0 18px rgba(245,158,11,0.6)",
          }}
        >
          ✦
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span
            className="font-silkscreen"
            style={{
              fontSize: 10,
              letterSpacing: "0.35em",
              color: "#fbbf24",
            }}
          >
            {t("balanceEyebrow")}
          </span>
          <span
            className="font-pixel"
            style={{
              fontSize: 36,
              letterSpacing: "0.06em",
              color: "#fde68a",
              textShadow: "0 0 12px rgba(251,191,36,0.5)",
              lineHeight: 1,
            }}
          >
            {balance.toLocaleString()}
          </span>
          <span
            className="font-silkscreen"
            style={{
              fontSize: 10,
              color: "var(--ink-mute)",
              letterSpacing: "0.32em",
            }}
          >
            {t("balanceSubtitle")}
          </span>
        </div>
      </div>

      <ul
        className="font-silkscreen"
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          fontSize: 10,
          letterSpacing: "0.2em",
          color: "var(--ink-mute)",
          textAlign: "right",
        }}
      >
        <li style={{ color: "#6ee7b7" }}>
          {t("weeklyIncoming", { amount: incoming })}
        </li>
        <li style={{ color: "#f472b6" }}>
          {t("weeklyOutgoing", { amount: outgoing })}
        </li>
        <li>{t("weeklyNet", { amount: net >= 0 ? `+${net}` : `${net}` })}</li>
      </ul>
    </section>
  );
}

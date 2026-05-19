"use client";

import { useTranslations } from "next-intl";

import { BalanceCard } from "./BalanceCard";
import { FreeEarnList } from "./FreeEarnList";
import { TopUpPackages } from "./TopUpPackages";
import { TransactionLog } from "./TransactionLog";
import { WalletActions } from "./WalletActions";
import { useWalletTransactions } from "@/lib/hooks/useWalletTransactions";

interface WalletViewProps {
  onClose: () => void;
}

export function WalletView({ onClose }: WalletViewProps) {
  const tWallet = useTranslations("profile.wallet");
  const tModal = useTranslations("profile.modal");
  const { rows, loading } = useWalletTransactions(50);

  return (
    <div
      data-testid="wallet-view"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        padding: "20px 24px",
        overflowY: "auto",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          className="font-silkscreen"
          style={{
            fontSize: 12,
            letterSpacing: "0.32em",
            color: "var(--accent-2)",
          }}
        >
          ● {tWallet("title")}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={tModal("closeAria")}
          className="font-silkscreen"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            fontSize: 11,
            letterSpacing: "0.25em",
            color: "var(--ink-mute)",
            background: "transparent",
            border: "1px solid var(--panel-stroke)",
            cursor: "pointer",
          }}
        >
          ✕ {tModal("close")}
        </button>
      </header>

      <BalanceCard transactions={rows} loading={loading} />
      <WalletActions />
      <TopUpPackages />
      <FreeEarnList />
      <TransactionLog rows={rows} loading={loading} />
    </div>
  );
}

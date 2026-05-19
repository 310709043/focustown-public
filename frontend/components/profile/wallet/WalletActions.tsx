"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import { useToastStore } from "@/lib/state/toastStore";

interface ActionTileProps {
  testId: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}

function ActionTile({ testId, icon, label, onClick }: ActionTileProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="pixel-btn font-silkscreen"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "18px 8px",
        fontSize: 12,
        letterSpacing: "0.32em",
        color: "var(--ink)",
        background: "rgba(20,10,55,0.6)",
        borderColor: "var(--panel-stroke-strong)",
        cursor: "pointer",
        minHeight: 90,
      }}
    >
      <span aria-hidden style={{ fontSize: 22, color: "var(--accent-3)" }}>
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

export function WalletActions() {
  const t = useTranslations("profile.wallet");
  const push = useToastStore((s) => s.push);
  const comingSoon = () =>
    push({ kind: "info", message: t("comingSoon") });

  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 10,
      }}
    >
      <ActionTile
        testId="wallet-action-topup"
        icon="+"
        label={t("actions.topUp")}
        onClick={comingSoon}
      />
      <ActionTile
        testId="wallet-action-gift"
        icon="↗"
        label={t("actions.gift")}
        onClick={comingSoon}
      />
      <ActionTile
        testId="wallet-action-redeem"
        icon="▦"
        label={t("actions.redeem")}
        onClick={comingSoon}
      />
    </section>
  );
}

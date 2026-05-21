"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import type { WalletTransaction } from "@/lib/api/types.gen";

type Filter = "all" | "income" | "outgoing" | "topup";

// 2026-05-21: V1 hides recharge UX. Surfaced as a const so the filter
// loop, the visible filter-tab list, and any future re-enable touch
// the same toggle.
const SHOW_TOPUP = false;
const FILTER_TABS: ReadonlyArray<Filter> = SHOW_TOPUP
  ? (["all", "income", "outgoing", "topup"] as const)
  : (["all", "income", "outgoing"] as const);

interface TransactionLogProps {
  rows: WalletTransaction[];
  loading: boolean;
}

// TODO(wallet): once focus_session_sequence is exposed via the
// wallet transactions API, append "#N" to the description (e.g.
// "完成 #5 連續番茄") to match profile_supply.jpg.
const KNOWN_REASONS = new Set([
  "session_complete",
  "pomodoro_complete",
  "group_focus",
  "streak_bonus",
  "achievement_unlock",
  "purchase",
  "top_up",
  "gift_sent",
  "gift_received",
  "redeem_code",
  "feedback_reward",
]);

function fromMinor(amountMinor: number): number {
  return Math.round(amountMinor / 100);
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isTopUpReason(reason: string | null | undefined): boolean {
  if (!reason) return false;
  return reason === "top_up" || reason === "redeem_code";
}

export function TransactionLog({ rows, loading }: TransactionLogProps) {
  const t = useTranslations("profile.wallet.tx");
  const tReasons = useTranslations("profile.wallet.tx.reasons");
  const [filter, setFilter] = useState<Filter>("all");

  const labelForReason = (reason: string | null | undefined): string => {
    if (reason && KNOWN_REASONS.has(reason)) return tReasons(reason);
    return reason ? reason.replace(/_/g, " ") : t("reasonFallback");
  };

  const filtered = useMemo(() => {
    return rows.filter((tx) => {
      if (tx.currency_code !== "T") return false;
      // V1 hides recharge rows entirely from the ledger regardless of
      // which filter is active — the ledger should never surface top-ups
      // until payments ship.
      if (!SHOW_TOPUP && isTopUpReason(tx.reason)) return false;
      if (filter === "income") return tx.delta_minor > 0;
      if (filter === "outgoing") return tx.delta_minor < 0;
      if (filter === "topup") return isTopUpReason(tx.reason);
      return true;
    });
  }, [rows, filter]);

  return (
    <section
      data-testid="wallet-tx"
      className="pixel-panel"
      style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          className="font-silkscreen"
          style={{
            fontSize: 11,
            letterSpacing: "0.3em",
            color: "var(--accent-2)",
          }}
        >
          ● {t("title")}
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          {FILTER_TABS.map((f) => (
            <button
              key={f}
              type="button"
              data-testid={`wallet-tx-filter-${f}`}
              onClick={() => setFilter(f)}
              className="font-silkscreen"
              style={{
                padding: "4px 10px",
                fontSize: 9,
                letterSpacing: "0.24em",
                color: filter === f ? "#0c0524" : "var(--ink-mute)",
                background:
                  filter === f ? "var(--accent)" : "rgba(20,10,55,0.55)",
                border: "1px solid var(--panel-stroke)",
                cursor: "pointer",
              }}
            >
              {f === "all"
                ? t("filterAll")
                : f === "income"
                  ? t("filterIncome")
                  : f === "outgoing"
                    ? t("filterOutgoing")
                    : t("filterTopUp")}
            </button>
          ))}
        </div>
      </header>

      {loading || filtered.length === 0 ? (
        <div
          className="font-silkscreen"
          style={{
            padding: "24px 12px",
            border: "1px dashed var(--panel-stroke)",
            fontSize: 10,
            letterSpacing: "0.28em",
            color: "var(--ink-mute)",
            textAlign: "center",
          }}
        >
          {t("empty")}
        </div>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {filtered.map((tx) => {
            const isTopUp = isTopUpReason(tx.reason);
            const sign = tx.delta_minor > 0 ? "+" : tx.delta_minor < 0 ? "-" : "·";
            const color =
              isTopUp
                ? "#fbbf24"
                : tx.delta_minor > 0
                  ? "#6ee7b7"
                  : tx.delta_minor < 0
                    ? "#f472b6"
                    : "var(--ink-mute)";
            const reasonLabel = labelForReason(tx.reason);
            return (
              <li
                key={tx.id}
                data-testid="wallet-tx-row"
                className="font-silkscreen"
                style={{
                  display: "grid",
                  gridTemplateColumns: "28px 1fr 130px 80px",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 10px",
                  background: "rgba(20,10,55,0.4)",
                  border: "1px solid var(--panel-stroke)",
                  fontSize: 11,
                  letterSpacing: "0.12em",
                  color: "var(--ink)",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 22,
                    height: 22,
                    background: "rgba(245,158,11,0.15)",
                    color,
                    border: "1px solid var(--panel-stroke)",
                  }}
                >
                  {isTopUp ? "$" : sign}
                </span>
                <span>{reasonLabel}</span>
                <span
                  style={{ color: "var(--ink-mute)", fontSize: 10, letterSpacing: "0.18em" }}
                >
                  {formatTimestamp(tx.created_at)}
                </span>
                <span style={{ textAlign: "right", color, letterSpacing: "0.18em" }}>
                  {sign}
                  {fromMinor(Math.abs(tx.delta_minor))}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

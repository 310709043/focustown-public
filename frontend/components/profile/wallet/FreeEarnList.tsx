"use client";

import { useTranslations } from "next-intl";

interface EarnRow {
  key: string;
  icon: string;
  amount: number;
}

const EARN_ROWS: EarnRow[] = [
  { key: "pomodoro", icon: "🔋", amount: 5 },
  { key: "deepNight", icon: "🌙", amount: 10 },
  { key: "groupFocus", icon: "♟", amount: 15 },
  { key: "streak", icon: "🔥", amount: 50 },
  { key: "achievement", icon: "★", amount: 30 },
  { key: "feedback", icon: "💬", amount: 5 },
];

export function FreeEarnList() {
  const t = useTranslations("profile.wallet");

  return (
    <section
      data-testid="wallet-earn"
      className="pixel-panel"
      style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}
    >
      <header
        className="font-silkscreen"
        style={{
          fontSize: 11,
          letterSpacing: "0.3em",
          color: "var(--accent-2)",
        }}
      >
        ● {t("earn.title")}
      </header>

      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 6,
        }}
      >
        {EARN_ROWS.map((row) => (
          <li
            key={row.key}
            data-testid={`wallet-earn-${row.key}`}
            className="font-silkscreen"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              padding: "8px 12px",
              background: "rgba(20,10,55,0.45)",
              border: "1px solid var(--panel-stroke)",
              fontSize: 11,
              letterSpacing: "0.16em",
              color: "var(--ink)",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span aria-hidden style={{ fontSize: 14 }}>
                {row.icon}
              </span>
              <span>{t(`earn.${row.key}`)}</span>
            </span>
            <span style={{ color: "#6ee7b7", letterSpacing: "0.22em" }}>
              +{row.amount}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

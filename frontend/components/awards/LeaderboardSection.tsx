"use client";

import { useTranslations } from "next-intl";

import { BlinkDot } from "@/components/pixel/BlinkDot";
import type { LeaderboardEntry } from "@/lib/api/types.gen";

const RANK_GLYPH = ["🥇", "🥈", "🥉"];

export function LeaderboardSection({ leaders }: { leaders: LeaderboardEntry[] }) {
  const t = useTranslations("town.awards");

  return (
    <section
      data-testid="awards-leaderboard"
      className="pixel-panel"
      style={{
        padding: "15px 17px",
        display: "flex",
        flexDirection: "column",
        gap: 9,
      }}
    >
      <h3
        className="font-silkscreen"
        style={{
          fontSize: 10,
          letterSpacing: "0.1em",
          color: "var(--amber)",
          textShadow: "0 0 8px var(--amber)",
          margin: 0,
        }}
      >
        <BlinkDot color="var(--amber)" marginRight={6} />
        {t("leadersHeading")}
      </h3>

      {leaders.length === 0 ? (
        <div
          className="font-silkscreen"
          style={{ fontSize: 11, color: "var(--ink-mute)" }}
        >
          {t("leadersEmpty")}
        </div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {leaders.map((l, i) => (
            <li
              key={l.user_id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "6px 0",
                borderBottom:
                  i === leaders.length - 1
                    ? "none"
                    : "1px solid var(--panel-stroke)",
                fontSize: 12,
                color: "var(--ink)",
              }}
            >
              <span
                className="font-silkscreen"
                style={{
                  fontSize: 11,
                  width: 22,
                  textAlign: "center",
                  color: "var(--amber)",
                  flexShrink: 0,
                }}
              >
                {i < 3 ? RANK_GLYPH[i] : i + 1}
              </span>
              <span
                style={{
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {l.display_name}
              </span>
              <span
                className="font-silkscreen"
                style={{ fontSize: 11, color: "var(--amber)", flexShrink: 0 }}
              >
                {l.completed_count} {t("leaderCountSuffix")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

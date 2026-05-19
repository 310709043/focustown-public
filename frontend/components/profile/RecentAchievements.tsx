"use client";

import { useTranslations } from "next-intl";

import type { Achievement } from "@/lib/api/types.gen";

interface RecentAchievementsProps {
  items: Achievement[];
  /** Display this many at most. Reference image shows 4. */
  limit?: number;
}

export function RecentAchievements({ items, limit = 4 }: RecentAchievementsProps) {
  const t = useTranslations("profile.stats.achievements");
  const shown = items.slice(0, limit);

  return (
    <section
      data-testid="profile-recent-achievements"
      style={{
        padding: 16,
        background: "rgba(7,4,26,0.7)",
        border: "1px solid var(--panel-stroke)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
          color: "var(--accent-2)",
          letterSpacing: "0.25em",
        }}
        className="font-silkscreen"
      >
        <span
          aria-hidden
          className="animate-blinkSoft"
          style={{
            width: 8,
            height: 8,
            background: "var(--accent-2)",
            boxShadow: "var(--neon-glow-pink)",
          }}
        />
        {t("title")}
      </header>

      {shown.length > 0 ? (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          {shown.map((badge) => (
            <span
              key={badge.code}
              className="font-silkscreen"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                fontSize: 11,
                letterSpacing: "0.15em",
                color: "var(--ink)",
                background: "rgba(17,8,38,0.85)",
                border: "1px solid var(--accent-2)",
                boxShadow: "0 0 10px rgba(244,114,182,0.18)",
              }}
              title={badge.description}
            >
              <span aria-hidden style={{ fontSize: 14 }}>
                {badge.icon}
              </span>
              {badge.title}
            </span>
          ))}
        </div>
      ) : (
        <p
          className="font-silkscreen"
          style={{
            margin: 0,
            fontSize: 11,
            letterSpacing: "0.15em",
            color: "var(--ink-dim)",
          }}
        >
          {t("emptyHint")}
        </p>
      )}
    </section>
  );
}

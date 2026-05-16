"use client";

import { useTranslations } from "next-intl";

import { BlinkDot } from "@/components/pixel/BlinkDot";
import type { Achievement } from "@/lib/api/types.gen";

export function AchievementsSection({
  achievements,
}: {
  achievements: Achievement[];
}) {
  const t = useTranslations("town.awards");

  return (
    <section
      data-testid="awards-achievements"
      className="pixel-panel"
      style={{
        padding: "15px 17px",
        display: "flex",
        flexDirection: "column",
        gap: 9,
        gridColumn: "1 / -1",
      }}
    >
      <h3
        className="font-silkscreen"
        style={{
          fontSize: 10,
          letterSpacing: "0.1em",
          color: "var(--teal)",
          textShadow: "0 0 8px var(--teal)",
          margin: 0,
        }}
      >
        <BlinkDot color="var(--teal)" marginRight={6} />
        {t("achievementsHeading")}
      </h3>

      {achievements.length === 0 ? (
        <div
          className="font-silkscreen"
          style={{ fontSize: 11, color: "var(--ink-mute)" }}
        >
          {t("achievementsEmpty")}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 7,
          }}
        >
          {achievements.map((a) => (
            <div
              key={a.code}
              className="pixel-panel"
              style={{
                padding: "9px 11px",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 18, flexShrink: 0 }}>{a.icon}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--ink)",
                    lineHeight: 1.3,
                  }}
                >
                  {a.title}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--ink-mute)",
                    lineHeight: 1.3,
                  }}
                >
                  {a.description}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

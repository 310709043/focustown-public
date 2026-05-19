"use client";

import { useTranslations } from "next-intl";

const HEATMAP_COLORS = [
  "rgba(167,139,250,0.06)",
  "rgba(124,58,237,0.35)",
  "rgba(167,139,250,0.65)",
  "rgba(196,181,253,0.9)",
  "#ec4899",
] as const;

const HOUR_TICK_KEYS = ["0", "6", "12", "18", "24"] as const;
type HourTickKey = (typeof HOUR_TICK_KEYS)[number];

function isHourTickKey(value: string): value is HourTickKey {
  return (HOUR_TICK_KEYS as readonly string[]).includes(value);
}

interface FocusHeatmapProps {
  /** 7 rows × 24 cells, each 0–4. */
  weekly: number[][];
  weekTotalHours: number;
}

export function FocusHeatmap({ weekly, weekTotalHours }: FocusHeatmapProps) {
  const t = useTranslations("profile.stats.heatmap");

  return (
    <section
      data-testid="profile-heatmap"
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
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            color: "var(--accent)",
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
              background: "var(--accent)",
              boxShadow: "var(--neon-glow)",
            }}
          />
          {t("title")}
        </span>
        <span
          className="font-silkscreen"
          style={{
            fontSize: 11,
            letterSpacing: "0.2em",
            color: "var(--accent-2)",
          }}
        >
          {t("weeklyTotal", { hours: weekTotalHours.toFixed(1) })}
        </span>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          rowGap: 4,
          columnGap: 8,
          alignItems: "center",
        }}
      >
        {weekly.map((row, dayIdx) => {
          const dayKey = String(dayIdx + 1) as "1" | "2" | "3" | "4" | "5" | "6" | "7";
          return (
            <Row key={dayIdx} dayLabel={t(`dayShort.${dayKey}`)} cells={row} />
          );
        })}

        {/* Hour-axis ticks across the 24 columns */}
        <span />
        <div
          aria-hidden
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(24, 1fr)",
            marginTop: 4,
          }}
        >
          {Array.from({ length: 24 }).map((_, hour) => {
            const key = String(hour);
            const label = isHourTickKey(key) ? t(`hourTick.${key}`) : "";
            return (
              <span
                key={hour}
                className="font-silkscreen"
                style={{
                  fontSize: 8,
                  color: "var(--ink-dim)",
                  letterSpacing: "0.1em",
                  textAlign: hour === 0 ? "left" : hour === 23 ? "right" : "center",
                  gridColumn: `${hour + 1} / span 1`,
                }}
              >
                {label}
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Row({ dayLabel, cells }: { dayLabel: string; cells: number[] }) {
  return (
    <>
      <span
        className="font-silkscreen"
        style={{
          fontSize: 10,
          color: "var(--ink-mute)",
          letterSpacing: "0.18em",
          width: 18,
          textAlign: "center",
        }}
      >
        {dayLabel}
      </span>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(24, 1fr)",
          gap: 2,
        }}
      >
        {cells.map((intensity, hour) => {
          const safe = Math.max(0, Math.min(4, intensity));
          return (
            <span
              key={hour}
              aria-hidden
              style={{
                height: 18,
                background: HEATMAP_COLORS[safe],
                boxShadow:
                  safe >= 3
                    ? "0 0 6px rgba(236,72,153,0.45)"
                    : safe >= 2
                      ? "inset 0 0 0 1px rgba(167,139,250,0.18)"
                      : undefined,
              }}
            />
          );
        })}
      </div>
    </>
  );
}


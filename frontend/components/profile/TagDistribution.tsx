"use client";

import { useTranslations } from "next-intl";

import type { TagKey } from "@/lib/hooks/useUserStats";

interface TagDistributionProps {
  rows: Array<{ key: TagKey; percent: number }>;
}

const TAG_STYLE: Record<TagKey, { fill: string; track: string; text: string }> = {
  coding: {
    fill: "linear-gradient(90deg, #7c3aed 0%, #a78bfa 100%)",
    track: "rgba(167,139,250,0.12)",
    text: "#a78bfa",
  },
  writing: {
    fill: "linear-gradient(90deg, #be185d 0%, #f472b6 100%)",
    track: "rgba(244,114,182,0.12)",
    text: "#f472b6",
  },
  research: {
    fill: "linear-gradient(90deg, #0891b2 0%, #22d3ee 100%)",
    track: "rgba(34,211,238,0.12)",
    text: "#22d3ee",
  },
  other: {
    fill: "linear-gradient(90deg, #b45309 0%, #fcd34d 100%)",
    track: "rgba(252,211,77,0.12)",
    text: "#fcd34d",
  },
};

export function TagDistribution({ rows }: TagDistributionProps) {
  const t = useTranslations("profile.stats.tags");

  return (
    <section
      data-testid="profile-tag-distribution"
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
          marginBottom: 14,
          color: "#f472b6",
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
            background: "#f472b6",
            boxShadow: "0 0 10px #f472b6",
          }}
        />
        {t("title")}
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "84px 1fr 48px",
          rowGap: 10,
          columnGap: 12,
          alignItems: "center",
        }}
      >
        {rows.map((row) => {
          const style = TAG_STYLE[row.key];
          const label = t(row.key);
          return (
            <Row
              key={row.key}
              label={label}
              percent={row.percent}
              fill={style.fill}
              track={style.track}
              textColor={style.text}
              ariaLabel={t("rowAria", { label, percent: row.percent })}
            />
          );
        })}
      </div>
    </section>
  );
}

interface RowProps {
  label: string;
  percent: number;
  fill: string;
  track: string;
  textColor: string;
  ariaLabel: string;
}

function Row({ label, percent, fill, track, textColor, ariaLabel }: RowProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <>
      <span
        className="font-silkscreen"
        style={{
          fontSize: 11,
          letterSpacing: "0.18em",
          color: "var(--ink)",
        }}
      >
        {label}
      </span>
      <div
        role="progressbar"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        style={{
          position: "relative",
          height: 10,
          background: track,
          border: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        <div
          aria-hidden
          style={{
            height: "100%",
            width: `${clamped}%`,
            background: fill,
            boxShadow: `0 0 8px ${textColor}55`,
            transition: "width 320ms ease-out",
          }}
        />
      </div>
      <span
        className="font-silkscreen"
        style={{
          fontSize: 11,
          letterSpacing: "0.1em",
          color: textColor,
          textAlign: "right",
        }}
      >
        {clamped}%
      </span>
    </>
  );
}

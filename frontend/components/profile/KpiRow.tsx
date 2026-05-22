"use client";

import { useTranslations } from "next-intl";

import { KpiCard } from "./KpiCard";

interface KpiRowProps {
  totalTomatoes: number;
  allTimeFocusHours: number;
  streakDays: number;
  weeklyRank: number;
}

export function KpiRow({
  totalTomatoes,
  allTimeFocusHours,
  streakDays,
  weeklyRank,
}: KpiRowProps) {
  const t = useTranslations("profile.stats.kpi");

  return (
    <div
      data-testid="profile-kpi-row"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: 12,
      }}
    >
      <KpiCard accent="tomato" value={String(totalTomatoes)} label={t("tomatoes")} />
      <KpiCard
        accent="focus"
        value={t("valueWithUnitHours", { value: allTimeFocusHours })}
        label={t("focusHours")}
      />
      <KpiCard
        accent="streak"
        value={t("valueWithUnitDays", { value: streakDays })}
        label={t("streak")}
      />
      <KpiCard
        accent="rank"
        value={weeklyRank > 0 ? t("valueWithRank", { value: weeklyRank }) : "—"}
        label={t("weeklyRank")}
      />
    </div>
  );
}

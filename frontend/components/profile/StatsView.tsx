"use client";

import { useTranslations } from "next-intl";

import { FocusHeatmap } from "@/components/profile/FocusHeatmap";
import { KpiRow } from "@/components/profile/KpiRow";
import { RecentAchievements } from "@/components/profile/RecentAchievements";
import { useUserStats } from "@/lib/hooks/useUserStats";
import { useAuthStore } from "@/lib/state/authStore";

interface StatsViewProps {
  onClose: () => void;
}

export function StatsView({ onClose }: StatsViewProps) {
  const user = useAuthStore((s) => s.user);
  const stats = useUserStats(user);
  const tModal = useTranslations("profile.modal");

  return (
    <div
      data-testid="profile-stats-view"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
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
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span
            className="font-silkscreen"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              color: "var(--accent)",
              letterSpacing: "0.28em",
              fontSize: 14,
            }}
          >
            <span
              aria-hidden
              className="animate-blinkSoft"
              style={{
                width: 10,
                height: 10,
                background: "var(--accent)",
                boxShadow: "var(--neon-glow)",
              }}
            />
            {tModal("title")}
          </span>
          <span
            className="font-silkscreen"
            style={{
              fontSize: 10,
              letterSpacing: "0.18em",
              color: "var(--ink-dim)",
            }}
          >
            {tModal("subtitle")}
          </span>
        </div>
        <button
          type="button"
          data-testid="profile-close"
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
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--ink)";
            e.currentTarget.style.borderColor = "var(--accent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--ink-mute)";
            e.currentTarget.style.borderColor = "var(--panel-stroke)";
          }}
        >
          ✕ {tModal("close")}
        </button>
      </header>

      <KpiRow
        totalBatteries={stats.kpis.totalBatteries}
        allTimeFocusHours={stats.kpis.allTimeFocusHours}
        streakDays={stats.kpis.streakDays}
        weeklyRank={stats.kpis.weeklyRank}
      />
      <FocusHeatmap weekly={stats.heatmap} weekTotalHours={stats.weekTotalHours} />
      <RecentAchievements items={stats.recentAchievements} />
    </div>
  );
}

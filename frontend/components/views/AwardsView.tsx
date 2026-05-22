"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { LeaderboardSection } from "@/components/awards/LeaderboardSection";
import { AchievementsSection } from "@/components/awards/AchievementsSection";
import { leaderboardApi, achievementsApi } from "@/lib/api/endpoints";
import { errShape, reportApiError } from "@/lib/api/report";
import type { LeaderboardEntry, Achievement } from "@/lib/api/types.gen";

interface AwardsViewProps {
  /** Column count for the leaderboard's inner list. The /awards full-
   *  page route uses the default (1, narrower column for easier scan);
   *  the ACHV popup (AchievementsModal) passes `2` so more rows are
   *  visible without scrolling — per 2026-05-20 user feedback. */
  leaderboardColumns?: 1 | 2;
}

/**
 * Awards body (chromeless) — used inside AchievementsModal. The /awards
 * route page renders the full <AwardsScene> directly (it already includes
 * AwardsTopBar + this same section grid); this view exists so the modal
 * can host the pixel-faithful sections without their page-level top bar.
 */
export function AwardsView({ leaderboardColumns = 1 }: AwardsViewProps = {}) {
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const tApi = useTranslations("errors");

  useEffect(() => {
    leaderboardApi
      .today()
      .then(setLeaders)
      .catch((e) => {
        reportApiError(e, tApi);
        console.error({ event: "awards_leaderboard_failed", err: errShape(e) });
      });
    achievementsApi
      .all()
      .then((page) => setAchievements(page.items))
      .catch((e) => {
        reportApiError(e, tApi);
        console.error({ event: "awards_achievements_failed", err: errShape(e) });
      });
  }, [tApi]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: 13,
      }}
    >
      <LeaderboardSection leaders={leaders} columns={leaderboardColumns} />
      <AchievementsSection achievements={achievements} />
    </div>
  );
}

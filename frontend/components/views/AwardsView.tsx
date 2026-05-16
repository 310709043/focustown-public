"use client";

import { useEffect, useState } from "react";

import { LeaderboardSection } from "@/components/awards/LeaderboardSection";
import { AchievementsSection } from "@/components/awards/AchievementsSection";
import { leaderboardApi, achievementsApi } from "@/lib/api/endpoints";
import type { LeaderboardEntry, Achievement } from "@/lib/api/types.gen";

/**
 * Awards body (chromeless) — used inside AchievementsModal. The /awards
 * route page renders the full <AwardsScene> directly (it already includes
 * AwardsTopBar + this same section grid); this view exists so the modal
 * can host the pixel-faithful sections without their page-level top bar.
 */
export function AwardsView() {
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);

  useEffect(() => {
    leaderboardApi.today().then(setLeaders).catch(() => {});
    achievementsApi.all().then(setAchievements).catch(() => {});
  }, []);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: 13,
      }}
    >
      <LeaderboardSection leaders={leaders} />
      <AchievementsSection achievements={achievements} />
    </div>
  );
}

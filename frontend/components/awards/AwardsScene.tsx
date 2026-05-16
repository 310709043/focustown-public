"use client";

import type { Achievement, LeaderboardEntry } from "@/lib/api/types.gen";

import { AchievementsSection } from "./AchievementsSection";
import { AwardsTopBar } from "./AwardsTopBar";
import { LeaderboardSection } from "./LeaderboardSection";

/**
 * Full-bleed /awards scene: pixel-UI top bar + scrollable two-column
 * section grid (leaderboard + achievements). Data flows in from the
 * route shell; no fetching here.
 */
export function AwardsScene({
  leaders,
  achievements,
}: {
  leaders: LeaderboardEntry[];
  achievements: Achievement[];
}) {
  return (
    <main
      data-testid="awards-scene"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "linear-gradient(135deg, #04011a, #090230, #04011a)",
      }}
    >
      <AwardsTopBar />
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 18,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 13,
        }}
      >
        <LeaderboardSection leaders={leaders} />
        <AchievementsSection achievements={achievements} />
      </div>
    </main>
  );
}

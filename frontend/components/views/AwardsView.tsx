"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { AchievementsSection } from "@/components/awards/AchievementsSection";
import { achievementsApi } from "@/lib/api/endpoints";
import { errShape, reportApiError } from "@/lib/api/report";
import type { Achievement } from "@/lib/api/types.gen";

/**
 * Awards body (chromeless) — used inside AchievementsModal. The /awards
 * route page renders the full <AwardsScene> directly (it already includes
 * AwardsTopBar + the same achievements grid); this view exists so the
 * modal can host the pixel-faithful section without the page-level top
 * bar. Leaderboard section was removed per 2026-05-23 user feedback —
 * the ACHV popup is now achievements-only.
 */
export function AwardsView() {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const tApi = useTranslations("errors");

  useEffect(() => {
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
        // `min(280px, 100%)` lets the column shrink below 280px on
        // phones so there's no horizontal scroll after outer padding.
        // With a single child the grid simply spans full width.
        gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))",
        gap: 13,
      }}
    >
      <AchievementsSection achievements={achievements} />
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";

import { achievementsApi } from "@/lib/api/endpoints";
import type { Achievement, User } from "@/lib/api/types.gen";

/**
 * useUserStats — single source for the profile dashboard.
 *
 * Real data:
 *   • recentAchievements    — GET /api/v1/achievements/me (live)
 *
 * Placeholder data (seeded by user.id so the dashboard is stable
 * across reloads; remove once the backend endpoint below ships):
 *
 *   // TODO(stats-endpoint): build `GET /api/v1/users/me/stats` that
 *   // returns the shape below from FocusSession history and swap all
 *   // values flagged `seeded(...)` to the real response.
 *   //
 *   //   {
 *   //     total_tomatoes:        int,
 *   //     all_time_focus_hours:  number,
 *   //     streak_days:           int,
 *   //     weekly_rank:           int,
 *   //     week_total_hours:      number,
 *   //     heatmap:               int[7][24],   // intensity 0–4
 *   //     tag_distribution: [
 *   //       { tag: "coding"|"writing"|"research"|"other", percent: int },
 *   //     ],
 *   //     level:                 int,
 *   //     xp:                    int,
 *   //     xp_next_level:         int,
 *   //   }
 */
export interface UserStats {
  kpis: {
    totalTomatoes: number;
    allTimeFocusHours: number;
    streakDays: number;
    weeklyRank: number;
  };
  weekTotalHours: number;
  heatmap: number[][];
  tagDistribution: Array<{ key: TagKey; percent: number }>;
  level: number;
  xp: number;
  xpNextLevel: number;
  recentAchievements: Achievement[];
  isLoading: boolean;
}

export type TagKey = "coding" | "writing" | "research" | "other";

export function useUserStats(user: Pick<User, "id"> | null): UserStats {
  const [recent, setRecent] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setRecent([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    achievementsApi
      .mine()
      .then((items) => {
        if (!cancelled) setRecent(items);
      })
      .catch(() => {
        if (!cancelled) setRecent([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const seeded = useMemo(() => seededFromId(user?.id ?? ""), [user?.id]);

  return {
    kpis: {
      totalTomatoes: seeded.totalTomatoes,
      allTimeFocusHours: seeded.allTimeFocusHours,
      streakDays: seeded.streakDays,
      weeklyRank: seeded.weeklyRank,
    },
    weekTotalHours: seeded.weekTotalHours,
    heatmap: seeded.heatmap,
    tagDistribution: seeded.tagDistribution,
    level: seeded.level,
    xp: seeded.xp,
    xpNextLevel: seeded.xpNextLevel,
    recentAchievements: recent,
    isLoading: loading,
  };
}

interface SeededStats {
  totalTomatoes: number;
  allTimeFocusHours: number;
  streakDays: number;
  weeklyRank: number;
  weekTotalHours: number;
  heatmap: number[][];
  tagDistribution: Array<{ key: TagKey; percent: number }>;
  level: number;
  xp: number;
  xpNextLevel: number;
}

/**
 * Deterministic seed shared with CitizenIdCard's barcode helper: same
 * djb2 → linear-congruential walk so the same user always lands on the
 * same dashboard until the real endpoint replaces this.
 */
function seededFromId(seed: string): SeededStats {
  if (!seed) return EMPTY_SEEDED;
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  }
  const rng = () => {
    h = (h * 1664525 + 1013904223) | 0;
    return Math.abs(h) / 0x7fffffff;
  };
  const intIn = (min: number, max: number) =>
    Math.floor(rng() * (max - min + 1)) + min;

  const totalTomatoes = intIn(120, 340);
  const allTimeFocusHours = intIn(45, 180);
  const streakDays = intIn(6, 38);
  const weeklyRank = intIn(2, 18);

  // 7 days × 24 hours; bias intensity around working hours.
  const heatmap: number[][] = [];
  let weekMinutes = 0;
  for (let d = 0; d < 7; d++) {
    const row: number[] = [];
    for (let h24 = 0; h24 < 24; h24++) {
      const inWindow = (h24 >= 9 && h24 <= 11) || (h24 >= 14 && h24 <= 17) || (h24 >= 20 && h24 <= 22);
      const base = inWindow ? 2 : 0.4;
      const roll = rng() + base;
      const intensity = Math.min(4, Math.max(0, Math.floor(roll)));
      row.push(intensity);
      weekMinutes += intensity * 12;
    }
    heatmap.push(row);
  }
  const weekTotalHours = Math.round((weekMinutes / 60) * 10) / 10;

  // Four tag percentages that sum to 100. Reference image uses 45/25/18/12.
  const a = intIn(38, 50);
  const b = intIn(20, 30);
  const c = intIn(12, 22);
  const d = Math.max(2, 100 - a - b - c);
  const tagDistribution: Array<{ key: TagKey; percent: number }> = [
    { key: "coding", percent: a },
    { key: "writing", percent: b },
    { key: "research", percent: c },
    { key: "other", percent: d },
  ];

  const level = Math.max(1, Math.min(20, Math.floor(allTimeFocusHours / 25) + 1));
  const xpNextLevel = 2000;
  const xp = intIn(800, 1900);

  return {
    totalTomatoes,
    allTimeFocusHours,
    streakDays,
    weeklyRank,
    weekTotalHours,
    heatmap,
    tagDistribution,
    level,
    xp,
    xpNextLevel,
  };
}

const EMPTY_SEEDED: SeededStats = {
  totalTomatoes: 0,
  allTimeFocusHours: 0,
  streakDays: 0,
  weeklyRank: 0,
  weekTotalHours: 0,
  heatmap: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0)),
  tagDistribution: [
    { key: "coding", percent: 0 },
    { key: "writing", percent: 0 },
    { key: "research", percent: 0 },
    { key: "other", percent: 0 },
  ],
  level: 1,
  xp: 0,
  xpNextLevel: 2000,
};

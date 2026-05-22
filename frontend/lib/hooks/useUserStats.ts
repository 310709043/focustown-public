"use client";

import { useEffect, useState } from "react";

import { achievementsApi, userApi, type UserStats as UserStatsDto } from "@/lib/api/endpoints";
import type { Achievement, User } from "@/lib/api/types.gen";

/**
 * useUserStats — single source for the profile dashboard.
 *
 * All values come from the backend:
 *   • achievementsApi.mine()         → /api/v1/achievements/me
 *   • userApi.myStats()              → /api/v1/users/me/stats
 *
 * A brand-new account (no completed focus sessions) returns all-zero
 * KPIs and an empty heatmap — that is the correct production state.
 * No client-side seeded PRNG (the previous implementation produced
 * synthetic numbers per user.id; removed once /me/stats shipped).
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
  level: number;
  xp: number;
  xpNextLevel: number;
  recentAchievements: Achievement[];
  isLoading: boolean;
}

const EMPTY_HEATMAP: number[][] = Array.from({ length: 7 }, () =>
  Array.from({ length: 24 }, () => 0),
);

const ZERO_STATS: UserStatsDto = {
  total_tomatoes: 0,
  all_time_focus_hours: 0,
  week_total_hours: 0,
  streak_days: 0,
  weekly_rank: 0,
  heatmap: EMPTY_HEATMAP,
  level: 1,
  xp: 0,
  xp_next_level: 2000,
};

export function useUserStats(user: Pick<User, "id"> | null): UserStats {
  const [recent, setRecent] = useState<Achievement[]>([]);
  const [stats, setStats] = useState<UserStatsDto>(ZERO_STATS);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setRecent([]);
      setStats(ZERO_STATS);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.allSettled([achievementsApi.mine(), userApi.myStats()])
      .then(([achResult, statsResult]) => {
        if (cancelled) return;
        if (achResult.status === "fulfilled") {
          setRecent(achResult.value);
        } else {
          setRecent([]);
        }
        if (statsResult.status === "fulfilled") {
          setStats(statsResult.value);
        } else {
          setStats(ZERO_STATS);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return {
    kpis: {
      totalTomatoes: stats.total_tomatoes,
      allTimeFocusHours: stats.all_time_focus_hours,
      streakDays: stats.streak_days,
      weeklyRank: stats.weekly_rank,
    },
    weekTotalHours: stats.week_total_hours,
    heatmap: stats.heatmap.length === 7 ? stats.heatmap : EMPTY_HEATMAP,
    level: stats.level,
    xp: stats.xp,
    xpNextLevel: stats.xp_next_level,
    recentAchievements: recent,
    isLoading: loading,
  };
}

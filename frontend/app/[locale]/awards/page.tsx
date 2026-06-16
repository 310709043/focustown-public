"use client";

import { useEffect, useState } from "react";

import { AwardsScene } from "@/components/awards/AwardsScene";
import { achievementsApi, leaderboardApi } from "@/lib/api/endpoints";
import type { Achievement, LeaderboardEntry } from "@/lib/api/types.gen";
import { pushErrorToast } from "@/lib/state/toastStore";

export default function AwardsPage() {
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);

  useEffect(() => {
    leaderboardApi.today().then(setLeaders).catch(() => {
      pushErrorToast("Failed to load leaderboard");
    });
    achievementsApi.all().then((page) => setAchievements(page.items)).catch(() => {
      pushErrorToast("Failed to load achievements");
    });
  }, []);

  return <AwardsScene leaders={leaders} achievements={achievements} />;
}

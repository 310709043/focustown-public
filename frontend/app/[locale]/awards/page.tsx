"use client";

import { useEffect, useState } from "react";

import { AwardsScene } from "@/components/awards/AwardsScene";
import { achievementsApi, leaderboardApi } from "@/lib/api/endpoints";
import type { Achievement, LeaderboardEntry } from "@/lib/api/types.gen";

export default function AwardsPage() {
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);

  useEffect(() => {
    leaderboardApi.today().then(setLeaders).catch(() => {});
    achievementsApi.all().then(setAchievements).catch(() => {});
  }, []);

  return <AwardsScene leaders={leaders} achievements={achievements} />;
}

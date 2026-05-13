"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { leaderboardApi, achievementsApi } from "@/lib/api/endpoints";
import type { LeaderboardEntry, Achievement } from "@/lib/api/types.gen";

export default function AwardsPage() {
  const router = useRouter();
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);

  useEffect(() => {
    leaderboardApi.today().then(setLeaders).catch(() => {});
    achievementsApi.all().then(setAchievements).catch(() => {});
  }, []);

  return (
    <main
      className="absolute inset-0 flex flex-col overflow-hidden"
      style={{ background: "linear-gradient(135deg,#04011a,#090230,#04011a)" }}
    >
      <header className="h-[46px] bg-[rgba(3,1,17,.96)] border-b border-border flex items-center justify-between px-4">
        <div
          className="font-pixel text-[9px] tracking-widest"
          style={{ color: "var(--amber)", textShadow: "0 0 10px var(--amber)" }}
        >
          ✦ 大賞區 · HALL OF FAME
        </div>
        <button
          onClick={() => router.push("/town")}
          className="border border-border text-muted font-japan text-[10px] px-3 py-1 rounded hover:border-coral hover:text-coral"
        >
          ✕ 關閉
        </button>
      </header>
      <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-3">
        <section className="bg-card border border-border rounded-lg p-4 flex flex-col gap-2">
          <h3
            className="font-pixel text-[8px] tracking-wider"
            style={{ color: "var(--amber)", textShadow: "0 0 8px var(--amber)" }}
          >
            🏆 今日番茄鐘排行
          </h3>
          {leaders.length === 0 ? (
            <div className="text-[11px] text-muted">尚無資料</div>
          ) : (
            leaders.map((l, i) => (
              <div key={l.user_id} className="flex items-center gap-2 py-1 border-b border-border last:border-0 text-[12px]">
                <span className="font-pixel text-[9px] w-5 text-center text-amber">
                  {i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}
                </span>
                <span className="flex-1 truncate">{l.display_name}</span>
                <span className="text-amber">{l.completed_count} 🍅</span>
              </div>
            ))
          )}
        </section>
        <section className="bg-card border border-border rounded-lg p-4 flex flex-col gap-2 col-span-2">
          <h3
            className="font-pixel text-[8px] tracking-wider"
            style={{ color: "var(--teal)", textShadow: "0 0 8px var(--teal)" }}
          >
            🎖️ 成就徽章
          </h3>
          {achievements.length === 0 ? (
            <div className="text-[11px] text-muted">尚未建立任何成就（v2 會由 seeder 寫入）</div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {achievements.map((a) => (
                <div key={a.code} className="bg-[rgba(20,10,50,.6)] border border-border rounded px-3 py-2 flex items-center gap-2">
                  <div className="text-xl">{a.icon}</div>
                  <div>
                    <div className="text-[11px]">{a.title}</div>
                    <div className="text-[10px] text-muted">{a.description}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

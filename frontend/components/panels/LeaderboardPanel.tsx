"use client";

import { useEffect, useState } from "react";
import { leaderboardApi } from "@/lib/api/endpoints";
import { findCharacter } from "@/lib/data/characters";
import type { LeaderboardEntry } from "@/lib/api/types.gen";

const MEDALS = ["🥇", "🥈", "🥉"];

export function LeaderboardPanel({ onMatchClick }: { onMatchClick: () => void }) {
  const [rows, setRows] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await leaderboardApi.today();
        if (!cancelled) setRows(data);
      } catch {
        /* ignore */
      }
    };
    void load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="panel relative overflow-hidden flex flex-col gap-1 px-2.5 py-2 bg-card border border-border rounded">
      <div className="text-[10px] text-muted">🏆 今日專注排行</div>
      <div className="flex flex-col gap-0.5 flex-1 overflow-hidden">
        {rows.length === 0 ? (
          <div className="text-[10px] text-muted text-center mt-4">尚無資料</div>
        ) : (
          rows.slice(0, 6).map((r, i) => {
            const ch = findCharacter(r.character_key);
            const rank = i < 3 ? MEDALS[i] : `#${i + 1}`;
            return (
              <div key={r.user_id} className="flex items-center gap-1.5 text-[10px] px-0.5 py-0.5">
                <span className="font-pixel text-[8px] w-3.5 text-center">{rank}</span>
                <div
                  className="w-3.5 h-3.5 rounded-sm flex items-center justify-center text-[9px]"
                  style={{ background: ch?.bodyColor ?? "#1a0840" }}
                >
                  {ch?.emoji ?? "👤"}
                </div>
                <span className="flex-1 truncate">{r.display_name}</span>
                <span className="text-[9px] text-coral">🍅{r.completed_count}</span>
              </div>
            );
          })
        )}
      </div>
      <button
        className="text-[10px] text-accent-1 hover:text-accent-2 text-left bg-transparent border-0 font-japan"
        onClick={onMatchClick}
      >
        ✦ 找今晚的專注夥伴 →
      </button>
    </div>
  );
}

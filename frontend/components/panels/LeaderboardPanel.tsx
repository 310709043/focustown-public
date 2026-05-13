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
    <div className="relative overflow-hidden flex flex-col gap-1.5 px-3 py-2.5 bg-card border border-border rounded-md">
      <div className="text-xs text-muted">🏆 今日專注排行</div>
      <div className="flex flex-col gap-0.5 flex-1 overflow-hidden">
        {rows.length === 0 ? (
          <div className="text-xs text-muted text-center mt-4">尚無資料</div>
        ) : (
          rows.slice(0, 5).map((r, i) => {
            const ch = findCharacter(r.character_key);
            const rank = i < 3 ? MEDALS[i] : `#${i + 1}`;
            return (
              <div
                key={r.user_id}
                className="flex items-center gap-2 px-0.5 py-0.5"
                style={{ fontSize: 12 }}
              >
                <span
                  className="font-pixel text-center"
                  style={{ fontSize: 10, width: 18 }}
                >
                  {rank}
                </span>
                <div
                  className="rounded-sm flex items-center justify-center shrink-0"
                  style={{
                    width: 18,
                    height: 18,
                    background: ch?.bodyColor ?? "#1a0840",
                    fontSize: 12,
                  }}
                >
                  {ch?.emoji ?? "👤"}
                </div>
                <span className="flex-1 truncate">{r.display_name}</span>
                <span style={{ fontSize: 11, color: "var(--coral)" }}>
                  🍅 {r.completed_count}
                </span>
              </div>
            );
          })
        )}
      </div>
      <button
        onClick={onMatchClick}
        className="font-japan text-left bg-accent-1/10 hover:bg-accent-1/20 border border-accent-1/40 hover:border-accent-1 rounded-md px-3 py-2 transition-all"
        style={{
          fontSize: 13,
          color: "var(--a2)",
          textShadow: "0 0 6px var(--a1)",
        }}
      >
        ✦ 找今晚的專注夥伴 →
      </button>
    </div>
  );
}

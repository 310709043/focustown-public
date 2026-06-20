"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { leaderboardApi } from "@/lib/api/endpoints";
import { findCharacter } from "@/lib/data/characters";
import { useAuthStore } from "@/lib/state/authStore";
import type { LeaderboardEntry } from "@/lib/api/types.gen";

const MEDALS = ["🥇", "🥈", "🥉"];

export function LeaderboardPanel() {
  const [rows, setRows] = useState<LeaderboardEntry[]>([]);
  const t = useTranslations("town.leaderboard");
  const selfId = useAuthStore((s) => s.user?.id ?? null);

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
    <div className="flex flex-col gap-0.5">
      {rows.length === 0 ? (
        <div className="text-xs text-muted text-center py-2">{t("empty")}</div>
      ) : (
        rows.slice(0, 5).map((r, i) => {
          const ch = findCharacter(r.character_key);
          const rank = i < 3 ? MEDALS[i] : `#${i + 1}`;
          const isSelf = r.user_id === selfId;
          return (
            <div
              key={r.user_id}
              className="flex items-center gap-2 px-1 py-0.5"
              style={{
                fontSize: 12,
                background: isSelf ? "rgba(245,158,11,0.15)" : undefined,
                border: isSelf ? "1px solid rgba(245,158,11,0.4)" : "1px solid transparent",
                borderRadius: isSelf ? 4 : undefined,
              }}
            >
              {isSelf ? (
                <span style={{ fontSize: 9, color: "var(--accent)", width: 8, flexShrink: 0 }}>▶</span>
              ) : null}
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
                🔋 {Math.floor(r.total_seconds / 60)}min
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { leaderboardApi } from "@/lib/api/endpoints";
import { findCharacter } from "@/lib/data/characters";
import type { LeaderboardEntry } from "@/lib/api/types.gen";

/**
 * Central pixel-neon billboard. Always-visible (no click-to-open).
 * Top half = live top-3 leaderboard. Bottom half = AD SLOT placeholder.
 * Flickers like a real neon sign on a slow random schedule.
 */
export function Billboard() {
  const [rows, setRows] = useState<LeaderboardEntry[]>([]);
  const t = useTranslations("town.scene");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await leaderboardApi.today();
        if (!cancelled) setRows(data.slice(0, 3));
      } catch {
        /* not signed in / offline — leave empty */
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
    <div
      className="absolute left-1/2 -translate-x-1/2 z-[5] animate-flicker pointer-events-none"
      style={{
        top: 56,
        width: 320,
      }}
    >
      <div
        className="pixel-edge"
        style={{
          background: "rgba(3,1,17,0.92)",
          border: "2px solid var(--a1)",
          boxShadow:
            "0 0 18px rgba(167,139,250,0.55), inset 0 0 24px rgba(124,58,237,0.18)",
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        {/* header strip */}
        <div
          className="font-pixel flex items-center justify-between px-3 py-1.5"
          style={{
            fontSize: 8,
            background:
              "linear-gradient(90deg, rgba(124,58,237,0.45), rgba(167,139,250,0.18) 50%, rgba(124,58,237,0.45))",
            color: "var(--a2)",
            letterSpacing: 1.5,
            textShadow: "0 0 6px var(--a1)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <span>✦ TOP 3 TODAY</span>
          <span style={{ color: "var(--teal)" }}>LIVE</span>
        </div>

        {/* leaderboard */}
        <div className="flex flex-col px-3 py-2 gap-1.5" style={{ minHeight: 92 }}>
          {rows.length === 0 ? (
            <div
              className="text-center self-center my-3"
              style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6 }}
            >
              {t("billboardEmptyLine1")}
              <br />
              <span style={{ color: "var(--a2)" }}>{t("billboardEmptyLine2")}</span>
            </div>
          ) : (
            rows.map((r, i) => {
              const ch = findCharacter(r.character_key);
              const color =
                i === 0 ? "var(--amber)" : i === 1 ? "#cbd5e1" : "#fbbf77";
              return (
                <div
                  key={r.user_id}
                  className="flex items-center gap-2"
                  style={{ fontSize: 12 }}
                >
                  <span
                    className={i === 0 ? "animate-crownBounce" : ""}
                    style={{ width: 16, fontSize: 14, color }}
                  >
                    {i === 0 ? "👑" : i === 1 ? "🥈" : "🥉"}
                  </span>
                  <span
                    className="w-4 h-4 rounded-sm flex items-center justify-center"
                    style={{
                      background: ch?.bodyColor ?? "#1a0840",
                      fontSize: 10,
                    }}
                  >
                    {ch?.emoji ?? "👤"}
                  </span>
                  <span
                    className="flex-1 truncate"
                    style={{ color: "var(--text)" }}
                  >
                    {r.display_name}
                  </span>
                  <span style={{ color, fontFamily: "var(--font-vt323), monospace", fontSize: 16 }}>
                    {r.completed_count} 🍅
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* AD SLOT placeholder */}
        <div
          className="mx-2 mb-2 flex items-center justify-center"
          style={{
            height: 64,
            border: "1.5px dashed rgba(167,139,250,0.5)",
            background:
              "repeating-linear-gradient(45deg, rgba(167,139,250,0.05), rgba(167,139,250,0.05) 8px, transparent 8px, transparent 16px)",
            borderRadius: 4,
          }}
        >
          <div className="text-center" style={{ lineHeight: 1.4 }}>
            <div
              className="font-pixel"
              style={{ fontSize: 9, color: "var(--a2)", letterSpacing: 2 }}
            >
              AD SLOT
            </div>
            <div style={{ fontSize: 10, color: "var(--muted)" }}>300 × 64 — your ad here</div>
          </div>
        </div>
      </div>

      {/* support beams (decorative pixel "scaffold") */}
      <div className="flex justify-between px-6 pointer-events-none">
        {[0, 1].map((k) => (
          <div
            key={k}
            style={{
              width: 3,
              height: 22,
              background: "linear-gradient(to bottom, var(--a4), #1a0840)",
              boxShadow: "0 0 4px rgba(0,0,0,0.6)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

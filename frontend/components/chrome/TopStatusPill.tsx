"use client";

import { useTranslations } from "next-intl";

import { useAuthStore } from "@/lib/state/authStore";
import { usePresenceStore } from "@/lib/state/presenceStore";
import { findCharacter } from "@/lib/data/characters";

/**
 * Inline status row: online-count chip + current-character chip. Lives
 * in the navbar's right cluster. Extracted from `app/town/page.tsx` so
 * the same surface can be reused on future screens (e.g. focus room
 * header) without duplicating the WebSocket-driven count.
 */
export function TopStatusPill() {
  const onlineCount = usePresenceStore((s) => Object.keys(s.byId).length);
  const user = useAuthStore((s) => s.user);
  const myChar = findCharacter(user?.character_key);
  const t = useTranslations("town.presence");

  return (
    <div className="flex items-center gap-2">
      <span
        className="rounded-md px-2.5 py-2 flex items-center gap-1.5"
        style={{
          background: "rgba(52,211,153,0.06)",
          border: "1px solid rgba(52,211,153,0.35)",
          fontSize: 12,
          color: "var(--teal)",
          fontFamily: "var(--font-vt323), monospace",
          letterSpacing: 0.6,
          textShadow: "0 0 6px rgba(52,211,153,0.4)",
        }}
        title={t("onlineTooltip")}
      >
        <span style={{ fontSize: 13 }}>👥</span>
        <span>{t("onlineShort", { count: onlineCount })}</span>
      </span>
      <span
        className="border border-border2 rounded-md px-3 py-2 flex items-center gap-1.5"
        style={{
          background: "rgba(167,139,250,0.08)",
          fontSize: 13,
          color: "var(--a2)",
        }}
      >
        <span style={{ fontSize: 15 }}>{myChar?.emoji ?? "👤"}</span>
        <span className="font-japan">
          {myChar?.name ?? user?.display_name ?? "..."}
        </span>
      </span>
    </div>
  );
}

"use client";

import { useTranslations } from "next-intl";

import { PixelSprite } from "@/components/pixel/PixelSprite";
import { useAuthStore } from "@/lib/state/authStore";
import { useUserStats } from "@/lib/hooks/useUserStats";
import { useTimerStore } from "@/lib/state/timerStore";
import { characterKeyToAvatar } from "@/lib/data/character-to-avatar";
import { BATTERY } from "@/lib/pixel/sprites/props";

interface UserStatusPillProps {
  /** Click handler — reference routes to a profile modal; we leave it
   *  as an optional callback so callers can decide. */
  onClick?: () => void;
}

const BATTERY_STRIP_LEN = 8;

/**
 * The center pill of the town top HUD: avatar tile (with the user's
 * pixel sprite + online green dot) + name + LV badge + status line +
 * battery chip strip.
 *
 * All numbers are live: battery count + level from `/users/me/stats`,
 * focus state from the local timer store. The 8-cell strip caps the
 * visual width — overflow past 8 is conveyed by the trailing `N/M`
 * counter so a power user with 23 batteries today still sees the real
 * total in text. Nothing is hardcoded.
 */
export function UserStatusPill({ onClick }: UserStatusPillProps) {
  const user = useAuthStore((s) => s.user);
  const stats = useUserStats(user);
  const timerRunning = useTimerStore((s) => s.running);
  const timerRemaining = useTimerStore((s) => s.remaining);
  const timerMode = useTimerStore((s) => s.mode);
  const t = useTranslations("town.statusPill");
  const avatar = characterKeyToAvatar(user?.character_key);

  const totalBatteries = stats.kpis.totalBatteries;
  const stripLen = Math.max(BATTERY_STRIP_LEN, totalBatteries);
  const filled = Math.min(stripLen, totalBatteries);
  const batteries = Array.from({ length: stripLen });
  const minutesRemaining = Math.max(0, Math.ceil(timerRemaining / 60));
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="user-status-pill"
      className="font-silkscreen"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "5px 14px 5px 5px",
        background: "rgba(7,4,26,0.92)",
        border: "1px solid var(--accent)",
        boxShadow:
          "var(--neon-glow), inset 0 0 12px rgba(183,148,246,0.1)",
        cursor: onClick ? "pointer" : "default",
        position: "relative",
        transition: "all 0.12s steps(2)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          background: "rgba(0,0,0,0.5)",
          border: "1px solid var(--accent-2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          flexShrink: 0,
        }}
      >
        <PixelSprite sprite={avatar.sprite} palette={avatar.palette} scale={2} />
        <span
          aria-hidden
          style={{
            position: "absolute",
            bottom: -2,
            right: -2,
            width: 8,
            height: 8,
            background: "#6ee7b7",
            border: "2px solid var(--bg-0)",
          }}
        />
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 2,
          minWidth: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontSize: 14,
              color: "var(--ink)",
              letterSpacing: "0.08em",
            }}
          >
            {user?.display_name ?? "..."}
          </span>
          <span
            data-testid="user-status-pill-level"
            style={{
              fontSize: 10,
              color: "var(--accent)",
              letterSpacing: "0.15em",
              padding: "1px 5px",
              border: "1px solid var(--accent)",
            }}
          >
            {t("level", { level: stats.level })}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 10,
          }}
        >
          <span
            aria-hidden
            className="animate-blinkSoft"
            style={{
              width: 6,
              height: 6,
              background: timerRunning && timerMode === "focus"
                ? "var(--accent-2)"
                : "var(--ink-dim)",
              boxShadow: timerRunning && timerMode === "focus"
                ? "var(--neon-glow-pink)"
                : "none",
            }}
          />
          <span
            data-testid="user-status-pill-status"
            style={{ color: "var(--accent-2)", letterSpacing: "0.15em" }}
          >
            {timerRunning && timerMode === "focus"
              ? t("focusing", { count: totalBatteries + 1 })
              : t("idle")}
          </span>
          {timerRunning ? (
            <>
              <span style={{ color: "var(--ink-dim)" }}>·</span>
              <span
                data-testid="user-status-pill-minutes"
                style={{ color: "var(--accent-3)", letterSpacing: "0.1em" }}
              >
                {t("minutes", { count: minutesRemaining })}
              </span>
            </>
          ) : null}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 1,
          marginLeft: 6,
          alignItems: "center",
        }}
      >
        {batteries.map((_, i) => (
          <PixelSprite
            key={i}
            sprite={BATTERY.sprite}
            palette={BATTERY.palette}
            scale={1.1}
            glow={i < filled ? null : null}
            style={i >= filled ? { opacity: 0.3 } : undefined}
          />
        ))}
        <span
          data-testid="user-status-pill-batteries"
          style={{ fontSize: 10, color: "var(--ink-dim)", marginLeft: 4 }}
        >
          {totalBatteries}
        </span>
      </div>
    </button>
  );
}

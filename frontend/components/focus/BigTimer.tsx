"use client";

import { useTranslations } from "next-intl";

import { PixelDigits } from "@/components/pixel/PixelDigits";
import { BatteryStrip } from "@/components/town/bottom/BatteryStrip";
import { useTimerStore } from "@/lib/state/timerStore";
import { useTimer } from "@/lib/hooks/useTimer";
import { useUserStats } from "@/lib/hooks/useUserStats";
import { useAuthStore } from "@/lib/state/authStore";

interface BigTimerProps {
  /** Solo passes null; buddy passes the partner user id. Forwarded to
   *  `useTimerStore.start()`. */
  partnerId?: string | null;
}

/**
 * Solo-room timer card. Header (● DEEP FOCUS / BREAK + 8 battery strip),
 * huge `PixelDigits` countdown, progress bar, two control buttons
 * (reset / play-pause), and a 3-stat footer. Skip / fast-forward was
 * dropped 2026-05-20 — the timer must only pause and restart, never
 * jump forward.
 *
 * Wraps the existing `useTimerStore` + `useTimer` so the session
 * lifecycle (start API call, tick interval, completion) is unchanged.
 */
export function BigTimer({ partnerId = null }: BigTimerProps) {
  useTimer();
  const {
    mode,
    remaining,
    durationSeconds,
    running,
    starting,
    batteryCount,
    start,
    pause,
    reset,
  } = useTimerStore();
  const t = useTranslations("focus.solo.bigTimer");
  const user = useAuthStore((s) => s.user);
  const { kpis } = useUserStats(user);

  const total = Math.max(1, durationSeconds);
  const pct = (1 - remaining / total) * 100;
  const mins = String(Math.floor(remaining / 60)).padStart(2, "0");
  const secs = String(remaining % 60).padStart(2, "0");

  return (
    <div
      data-testid="big-timer"
      className="pixel-panel relative"
      style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}
    >
      <CornerDeco />

      {/* Header — mode label + 8 battery strip. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div
          className="font-silkscreen"
          style={{
            fontSize: 10,
            color: "var(--accent)",
            letterSpacing: "0.25em",
          }}
        >
          ● {mode === "focus" ? t("headerFocus") : t("headerBreak")}
        </div>
        <BatteryStrip count={batteryCount} max={8} scale={1.4} />
      </div>

      {/* Big timer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "8px 0",
        }}
      >
        <PixelDigits
          text={`${mins}:${secs}`}
          scale={8}
          color="var(--ink)"
          glow="var(--accent)"
        />
      </div>

      {/* Progress */}
      <div
        style={{
          height: 12,
          background: "rgba(0,0,0,0.5)",
          border: "1px solid var(--panel-stroke)",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: "var(--accent)",
            boxShadow: "var(--neon-glow)",
            transition: "width 0.3s linear",
          }}
        />
      </div>

      {/* Controls — reset + play/pause only. Fast-forward / skip removed
          per QA: the timer must not allow jumping the countdown. */}
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <button
          type="button"
          data-testid="timer-reset"
          className="pixel-btn"
          style={{ padding: "8px 14px", fontSize: 11 }}
          onClick={() => reset()}
        >
          ↺ {t("resetCta")}
        </button>
        <button
          type="button"
          data-testid="timer-toggle"
          className="pixel-btn primary"
          style={{ padding: "10px 28px", fontSize: 13 }}
          disabled={starting}
          onClick={() =>
            running ? pause() : void start(undefined, partnerId)
          }
        >
          {starting
            ? `… ${t("startingCta")}`
            : running
              ? `⏸ ${t("pauseCta")}`
              : `▶ ${t("startCta")}`}
        </button>
      </div>

      {/* Stats footer */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
          marginTop: "auto",
          borderTop: "1px solid var(--panel-stroke)",
          paddingTop: 12,
        }}
      >
        <Stat label={t("statTodayLabel")} value={`${kpis.allTimeFocusHours * 60 | 0} min`} color="var(--accent)" />
        <Stat label={t("statStreakLabel")} value={t("statStreakValue", { days: kpis.streakDays })} color="var(--accent-2)" />
        <Stat label={t("statRankLabel")} value={kpis.weeklyRank > 0 ? `#${kpis.weeklyRank}` : "—"} color="var(--accent-3)" />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
      }}
    >
      <span
        className="font-silkscreen"
        style={{
          fontSize: 8,
          color: "var(--ink-mute)",
          letterSpacing: "0.2em",
        }}
      >
        {label}
      </span>
      <span
        className="font-silkscreen"
        style={{
          fontSize: 16,
          color,
          textShadow: `0 0 6px ${color}`,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function CornerDeco({ color = "var(--accent)" }: { color?: string }) {
  const c = { position: "absolute", width: 12, height: 12 } as const;
  return (
    <>
      <span aria-hidden style={{ ...c, top: -1, left: -1, borderTop: `2px solid ${color}`, borderLeft: `2px solid ${color}` }} />
      <span aria-hidden style={{ ...c, top: -1, right: -1, borderTop: `2px solid ${color}`, borderRight: `2px solid ${color}` }} />
      <span aria-hidden style={{ ...c, bottom: -1, left: -1, borderBottom: `2px solid ${color}`, borderLeft: `2px solid ${color}` }} />
      <span aria-hidden style={{ ...c, bottom: -1, right: -1, borderBottom: `2px solid ${color}`, borderRight: `2px solid ${color}` }} />
    </>
  );
}

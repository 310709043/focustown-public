"use client";

import { useTranslations } from "next-intl";

import { PixelDigits } from "@/components/pixel/PixelDigits";
import { BatteryStrip } from "@/components/town/bottom/BatteryStrip";
import { useTimerStore } from "@/lib/state/timerStore";
import { useTimer } from "@/lib/hooks/useTimer";
import { useUserStats } from "@/lib/hooks/useUserStats";
import { useAuthStore } from "@/lib/state/authStore";

const PRESETS = [
  { label: "25", minutes: 25 },
  { label: "45", minutes: 45 },
  { label: "50", minutes: 50 },
  { label: "90", minutes: 90 },
];

interface BigTimerProps {
  /** Solo passes null; buddy passes the partner user id. Forwarded to
   *  `useTimerStore.start()`. */
  partnerId?: string | null;
}

/**
 * Solo-room timer card. Header (● DEEP FOCUS / BREAK + 8 battery strip),
 * duration preset picker, huge `PixelDigits` countdown, progress bar,
 * two control buttons (reset / play-pause), and a 3-stat footer.
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
    setMode,
  } = useTimerStore();
  const t = useTranslations("focus.solo.bigTimer");
  const user = useAuthStore((s) => s.user);
  const { kpis, weekTotalHours } = useUserStats(user);

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

      {/* Duration presets — only shown when timer is idle */}
      {!running && !starting ? (
        <div
          style={{
            display: "flex",
            gap: 6,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          {PRESETS.map((p) => {
            const isActive = durationSeconds === p.minutes * 60;
            return (
              <button
                key={p.minutes}
                type="button"
                className="font-silkscreen"
                onClick={() => setMode("focus", p.minutes * 60)}
                style={{
                  fontSize: 9,
                  padding: "4px 8px",
                  letterSpacing: "0.15em",
                  cursor: "pointer",
                  border: isActive
                    ? "1px solid var(--accent)"
                    : "1px solid rgba(255,255,255,0.15)",
                  background: isActive ? "var(--accent)" : "rgba(0,0,0,0.3)",
                  color: isActive ? "#0a0118" : "var(--ink-mute)",
                  boxShadow: isActive ? "0 0 8px var(--accent)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                {p.label}
                <span style={{ opacity: 0.7, marginLeft: 2 }}>m</span>
              </button>
            );
          })}
        </div>
      ) : null}

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
        <Stat label="THIS WEEK" value={`${weekTotalHours.toFixed(1)}h`} color="var(--accent)" />
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

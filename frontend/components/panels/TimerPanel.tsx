"use client";

import { useTranslations } from "next-intl";
import { clsx } from "clsx";

import { useTimerStore } from "@/lib/state/timerStore";
import { useTimer } from "@/lib/hooks/useTimer";
import { fmtMS } from "@/lib/format";
import type { FocusSessionMode } from "@/lib/api/types.gen";

type ModeDef = {
  mode: FocusSessionMode;
  seconds: number;
  labelKey: "modeFocusLabel" | "modeShortLabel" | "modeLongLabel";
  icon: string;
};

const MODES: ModeDef[] = [
  { mode: "focus", seconds: 25 * 60, labelKey: "modeFocusLabel", icon: "🍅" },
  { mode: "short", seconds: 5 * 60, labelKey: "modeShortLabel", icon: "☕" },
  { mode: "long", seconds: 15 * 60, labelKey: "modeLongLabel", icon: "🌙" },
];

export function TimerPanel() {
  useTimer();
  const { mode, durationSeconds, remaining, running, tomatoCount, setMode, start, pause, reset } =
    useTimerStore();
  const t = useTranslations("focus.timer");

  const onToggle = async () => {
    if (running) {
      pause();
    } else {
      await start();
    }
  };

  const progress = (remaining / durationSeconds) * 100;
  const current = MODES.find((m) => m.mode === mode) ?? MODES[0];

  return (
    <div className="pixel-panel relative overflow-hidden flex flex-col gap-1.5 px-3 py-2.5">
      <div className="font-pixel-en text-xs" style={{ color: "var(--dir-ink-mute)", letterSpacing: 1 }}>
        {t(current.labelKey)}
      </div>
      <div className="flex items-center gap-3">
        <div
          className="font-pixel leading-tight tracking-widest"
          style={{
            fontSize: 24,
            color: "var(--a2)",
            textShadow: "0 0 14px var(--a1), 0 0 30px var(--a3)",
            flex: 1,
          }}
        >
          {fmtMS(remaining)}
        </div>
        {/* BIG play/pause button — the marquee control of the panel */}
        <button
          onClick={onToggle}
          aria-label={running ? t("pauseAria") : t("startAria")}
          className={clsx(
            "pixel-btn shrink-0 flex items-center justify-center",
            running && "animate-bigPulse",
          )}
          style={{
            width: 44,
            height: 44,
            fontSize: 18,
            padding: 0,
            background: running
              ? "linear-gradient(135deg, var(--a3), var(--a4))"
              : "var(--card)",
          }}
        >
          {running ? "⏸" : "▶"}
        </button>
      </div>
      <div className="h-1 bg-dim rounded-full overflow-hidden">
        <div
          className="h-full transition-[width] duration-700"
          style={{
            width: `${progress}%`,
            background: "linear-gradient(90deg,var(--a3),var(--a2))",
            boxShadow: "0 0 6px var(--a1)",
          }}
        />
      </div>
      <div className="flex gap-1 justify-between items-center">
        <div className="flex gap-1.5 md:gap-1">
          {MODES.map((m) => (
            <button
              key={m.mode}
              onClick={() => setMode(m.mode, m.seconds)}
              className={clsx(
                "border rounded transition-all px-2.5 py-1.5 touch:py-2 touch:min-h-[36px] md:px-2 md:py-1 font-japan",
                mode === m.mode
                  ? "border-accent-1 text-accent-1 bg-accent-1/10"
                  : "border-border text-muted hover:border-accent-1 hover:text-accent-1 active:border-accent-1 active:text-accent-1",
              )}
              style={{ fontSize: 12 }}
              aria-label={t(m.labelKey)}
            >
              {m.icon}
            </button>
          ))}
          <button
            onClick={reset}
            className="border border-border text-muted rounded px-2.5 py-1.5 touch:py-2 touch:min-h-[36px] md:px-2 md:py-1 hover:border-accent-1 hover:text-accent-1 active:border-accent-1 active:text-accent-1"
            style={{ fontSize: 12 }}
            aria-label={t("resetAria")}
          >
            ↺
          </button>
        </div>
        <div className="flex gap-0.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <span
              key={i}
              className={clsx("transition-opacity", i < tomatoCount ? "opacity-100" : "opacity-25")}
              style={{ fontSize: 12 }}
            >
              🍅
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

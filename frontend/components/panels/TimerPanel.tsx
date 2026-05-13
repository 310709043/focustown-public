"use client";

import { useTimerStore } from "@/lib/state/timerStore";
import { useTimer } from "@/lib/hooks/useTimer";
import { fmtMS } from "@/lib/format";
import type { FocusSessionMode } from "@/lib/api/types.gen";
import { clsx } from "clsx";

const MODES: { mode: FocusSessionMode; seconds: number; label: string; icon: string }[] = [
  { mode: "focus", seconds: 25 * 60, label: "🍅 專注",   icon: "🍅" },
  { mode: "short", seconds: 5 * 60,  label: "☕ 短休息", icon: "☕" },
  { mode: "long",  seconds: 15 * 60, label: "🌙 長休息", icon: "🌙" },
];

export function TimerPanel() {
  useTimer();
  const { mode, durationSeconds, remaining, running, tomatoCount, setMode, start, pause, reset } =
    useTimerStore();

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
    <div className="panel relative overflow-hidden flex flex-col gap-1 px-2.5 py-2 bg-card border border-border rounded">
      <div className="text-[10px] text-muted">{current.label} 模式</div>
      <div
        className="font-pixel text-[20px] text-center leading-tight tracking-widest"
        style={{
          color: "var(--a2)",
          textShadow: "0 0 14px var(--a1), 0 0 30px var(--a3)",
        }}
      >
        {fmtMS(remaining)}
      </div>
      <div className="h-0.5 bg-dim rounded-full overflow-hidden">
        <div
          className="h-full transition-[width] duration-700"
          style={{
            width: `${progress}%`,
            background: "linear-gradient(90deg,var(--a3),var(--a2))",
          }}
        />
      </div>
      <div className="flex gap-1 justify-center flex-wrap">
        {MODES.map((m) => (
          <button
            key={m.mode}
            onClick={() => setMode(m.mode, m.seconds)}
            className={clsx(
              "border rounded text-[10px] px-2 py-0.5 font-japan transition-all",
              mode === m.mode
                ? "border-accent-1 text-accent-1 bg-accent-1/10"
                : "border-border text-muted",
            )}
          >
            {m.icon}
          </button>
        ))}
        <button
          onClick={onToggle}
          className="border border-border text-muted rounded text-[10px] px-2 py-0.5 hover:border-accent-1 hover:text-accent-1"
        >
          {running ? "⏸" : "▶"}
        </button>
        <button
          onClick={reset}
          className="border border-border text-muted rounded text-[10px] px-2 py-0.5 hover:border-accent-1 hover:text-accent-1"
        >
          ↺
        </button>
      </div>
      <div className="flex gap-1 justify-center">
        {Array.from({ length: 4 }).map((_, i) => (
          <span
            key={i}
            className={clsx("text-[10px] transition-opacity", i < tomatoCount ? "opacity-100" : "opacity-25")}
          >
            🍅
          </span>
        ))}
      </div>
    </div>
  );
}

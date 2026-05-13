"use client";

import { useEffect, useState } from "react";
import { useTimerStore } from "@/lib/state/timerStore";
import { useTimer } from "@/lib/hooks/useTimer";
import { fmtMS } from "@/lib/format";

export function FocusTimer({ partnerId }: { partnerId?: string | null }) {
  useTimer();
  const [task, setTask] = useState("");
  const { remaining, durationSeconds, running, start, pause, reset } = useTimerStore();

  // Auto-reset when partner changes (defensive)
  useEffect(() => {
    reset();
  }, [partnerId, reset]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-6 relative">
      <div className="font-pixel text-[9px] text-muted tracking-widest">FOCUS SESSION</div>
      <div
        className="font-pixel leading-none transition-all duration-500"
        style={{
          fontSize: "clamp(40px,11vw,64px)",
          color: "var(--a2)",
          textShadow: "0 0 24px var(--a1), 0 0 60px var(--a3)",
        }}
      >
        {fmtMS(remaining)}
      </div>
      <div className="w-72 h-1 bg-dim rounded-sm overflow-hidden">
        <div
          className="h-full transition-[width] duration-700"
          style={{
            width: `${(remaining / durationSeconds) * 100}%`,
            background: "linear-gradient(90deg,var(--a3),var(--teal))",
          }}
        />
      </div>
      <input
        value={task}
        onChange={(e) => setTask(e.target.value)}
        placeholder="今晚在做什麼？"
        className="w-60 px-3 py-1.5 text-center text-xs border border-border rounded outline-none focus:border-accent-1 bg-[rgba(12,5,35,.8)]"
      />
      <div className="flex gap-2">
        <button
          className="font-pixel text-[8px] px-5 py-2.5 rounded border border-accent-1 text-accent-1 hover:bg-accent-1/10"
          onClick={() => (running ? pause() : void start(task || undefined, partnerId ?? null))}
        >
          {running ? "⏸ 暫停" : "▶ 開始"}
        </button>
        <button
          className="font-pixel text-[8px] px-5 py-2.5 rounded border border-border text-muted hover:border-muted hover:text-text"
          onClick={reset}
        >
          ↺ 重置
        </button>
      </div>
    </div>
  );
}

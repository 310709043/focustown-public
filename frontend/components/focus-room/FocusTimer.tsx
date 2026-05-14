"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useTimerStore } from "@/lib/state/timerStore";
import { useTimer } from "@/lib/hooks/useTimer";
import { fmtMS } from "@/lib/format";

export function FocusTimer({ partnerId }: { partnerId?: string | null }) {
  useTimer();
  const [task, setTask] = useState("");
  const { remaining, durationSeconds, running, start, pause, reset } = useTimerStore();
  const t = useTranslations("focus.timer");

  // Auto-reset when partner changes (defensive)
  useEffect(() => {
    reset();
  }, [partnerId, reset]);

  return (
    <div className="flex flex-col items-center justify-center gap-6 p-8 relative">
      <div
        className="font-pixel tracking-[6px]"
        style={{
          fontSize: "var(--font-size-label)",
          lineHeight: 1.2,
          color: "var(--muted)",
        }}
      >
        {t("header")}
      </div>

      {/* MASSIVE timer with 7-segment-style pixel border */}
      <div
        className="font-pixel leading-none transition-all duration-500 relative px-8 py-2"
        style={{
          fontSize: "clamp(80px, 18vw, 140px)",
          color: "var(--a2)",
          textShadow:
            "0 0 28px var(--a1), 0 0 70px var(--a3), 0 0 130px rgba(76,29,149,0.7)",
          letterSpacing: 8,
        }}
      >
        {/* corner pixel brackets */}
        {(["top-0 left-0", "top-0 right-0", "bottom-0 left-0", "bottom-0 right-0"] as const).map(
          (pos, i) => (
            <span
              key={i}
              className={`absolute ${pos}`}
              style={{
                width: 18,
                height: 18,
                borderTop: pos.includes("top") ? "2px solid var(--a1)" : "none",
                borderBottom: pos.includes("bottom") ? "2px solid var(--a1)" : "none",
                borderLeft: pos.includes("left") ? "2px solid var(--a1)" : "none",
                borderRight: pos.includes("right") ? "2px solid var(--a1)" : "none",
                boxShadow: "0 0 8px var(--a1)",
              }}
            />
          ),
        )}
        {fmtMS(remaining)}
      </div>

      <div
        className="rounded-full overflow-hidden"
        style={{
          width: "min(420px, 70vw)",
          height: 6,
          background: "rgba(0,0,0,0.5)",
          border: "1px solid var(--border)",
        }}
      >
        <div
          className="h-full transition-[width] duration-700"
          style={{
            width: `${(remaining / durationSeconds) * 100}%`,
            background: "linear-gradient(90deg, var(--a3), var(--teal), var(--a2))",
            boxShadow: "0 0 10px var(--a1)",
          }}
        />
      </div>

      <input
        value={task}
        onChange={(e) => setTask(e.target.value)}
        placeholder={t("taskPlaceholder")}
        className="text-center bg-[rgba(12,5,35,0.8)] border border-border rounded-md outline-none focus:border-accent-1 font-japan"
        style={{
          width: "min(380px, 70vw)",
          padding: "12px 18px",
          fontSize: "var(--font-size-body)",
          lineHeight: 1.5,
          letterSpacing: 1,
        }}
      />

      <div className="flex gap-3 flex-wrap justify-center">
        <button
          className="pixel-btn touch:min-h-[52px]"
          style={{
            fontSize: "var(--font-size-label)",
            lineHeight: 1.2,
            padding: "14px 28px",
            letterSpacing: 2,
          }}
          onClick={() => (running ? pause() : void start(task || undefined, partnerId ?? null))}
        >
          {running ? t("pauseCta") : t("startCta")}
        </button>
        <button
          className="pixel-btn touch:min-h-[52px]"
          style={{
            fontSize: "var(--font-size-label)",
            lineHeight: 1.2,
            padding: "14px 28px",
            letterSpacing: 2,
            background: "transparent",
            color: "var(--muted)",
            borderColor: "var(--border)",
            boxShadow: "none",
            textShadow: "none",
          }}
          onClick={reset}
        >
          {t("resetCta")}
        </button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

const TIP_KEYS = ["0", "1", "2", "3"] as const;
const TIP_ICONS = ["💡", "🌿", "☕", "🌙"] as const;
const ROTATION_MS = 8000;

interface Props {
  /** Today's pomodoro goal. Defaults to 4 (reference fixture). */
  goal?: number;
  /** Pomodoros already finished. Defaults to 3 (reference fixture). */
  completed?: number;
}

/**
 * Today's pomodoro goal strip — extracted so it can mount inside the
 * Tasks panel header per the QA round-1 restructure (今日目標 merged
 * into tasks). Pure presentational; takes goal + completed as props.
 */
export function DailyGoalStrip({ goal = 4, completed = 3 }: Props = {}) {
  const t = useTranslations("focus.solo.sessionInsight");
  return (
    <div data-testid="session-insight-progress">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          className="font-silkscreen"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 10,
            color: "var(--ink-mute)",
            letterSpacing: "0.18em",
          }}
        >
          <span
            aria-hidden
            className="animate-blinkSoft"
            style={{
              width: 6,
              height: 6,
              background: "var(--accent-2)",
              boxShadow: "var(--neon-glow-pink)",
            }}
          />
          ● {t("goalLabel", { goal })}
        </span>
        <span
          className="font-silkscreen"
          style={{
            fontSize: 10,
            color: "var(--accent)",
            letterSpacing: "0.15em",
          }}
        >
          {t("progressCounter", { done: completed, goal })}
        </span>
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
        {Array.from({ length: goal }).map((_, i) => {
          const isDone = i < completed;
          const isCursor = i === completed;
          return (
            <div
              key={i}
              data-testid="progress-chip"
              style={{
                flex: 1,
                height: 12,
                border: "1px solid var(--panel-stroke)",
                background: isDone ? "var(--accent)" : "rgba(0,0,0,0.4)",
                boxShadow: isDone ? "0 0 6px var(--accent)" : "none",
                position: "relative",
              }}
            >
              <span
                className="font-silkscreen"
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 9,
                  color: isDone ? "#0a0524" : "var(--ink-dim)",
                }}
              >
                {isDone ? "✓" : isCursor ? t("hereLabel") : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Rotating focus tip card. The goal-progress strip that used to live
 * here moved into `<TasksPanel>` via `<DailyGoalStrip>`. Tips cycle
 * every 8 s — pure visual feedback; no telemetry yet.
 */
export function SessionInsight(_props: Props = {}) {
  const t = useTranslations("focus.solo.sessionInsight");
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const id = window.setInterval(
      () => setIdx((i) => (i + 1) % TIP_KEYS.length),
      ROTATION_MS,
    );
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      data-testid="session-insight"
      className="pixel-panel"
      style={{
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        data-testid="session-insight-tip"
        style={{
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
          padding: "8px 10px",
          background: "rgba(34,211,238,0.08)",
          border: "1px solid var(--accent-3)",
        }}
      >
        <span style={{ fontSize: 16 }}>{TIP_ICONS[idx]}</span>
        <span
          style={{
            fontFamily: 'var(--font-vt323), "Noto Sans TC", monospace',
            fontSize: 14,
            color: "var(--ink)",
            lineHeight: 1.4,
          }}
        >
          {t(`tips.${TIP_KEYS[idx]}`)}
        </span>
      </div>
    </div>
  );
}

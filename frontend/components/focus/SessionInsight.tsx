"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

const TIP_EMOJI = ["💡", "🌿", "☕", "🌙"] as const;

/**
 * "Today's goal" 4-cell progress strip with a rotating tip every 8 s.
 * Reference renders the strip slim (12 px tall) — each completed cell
 * fills with `var(--accent)` + neon glow and shows a `✓` glyph; the
 * cursor cell shows `在這`. A right-aligned `N / M 完成` counter sits
 * to the right of the header. The tip block uses the reference's cyan
 * card style with a per-tip emoji prefix.
 */
export function SessionInsight() {
  const t = useTranslations("focus.solo.sessionInsight");
  const [idx, setIdx] = useState(0);
  const completed = 3;
  const goal = 4;

  useEffect(() => {
    const id = window.setInterval(() => setIdx((i) => (i + 1) % TIP_EMOJI.length), 8000);
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
      <div>
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
              fontSize: 10,
              color: "var(--ink-mute)",
              letterSpacing: "0.15em",
            }}
          >
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
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
          padding: "8px 10px",
          background: "rgba(34,211,238,0.08)",
          border: "1px solid var(--accent-3)",
        }}
      >
        <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>
          {TIP_EMOJI[idx]}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-vt323), "Noto Sans TC", monospace',
            fontSize: 14,
            color: "var(--ink)",
            lineHeight: 1.4,
          }}
        >
          {t(`tips.${idx}` as "tips.0")}
        </span>
      </div>
    </div>
  );
}

"use client";

interface BatteryStripProps {
  /** Number of "lit" batteries — indices < count glow green. */
  count: number;
  /** Total chips in the strip (default 8). */
  max?: number;
  /** Scale multiplier — affects chip size. Default 1. */
  scale?: number;
  /** Inter-chip gap in px. */
  gap?: number;
}

/**
 * Horizontal strip of CSS battery chips.
 *
 * Each chip is a small rectangle (body + terminal nub) rendered in CSS.
 * Active chips glow green with a pulse animation; inactive chips are a
 * barely-visible dark outline so the strip reads as "progress today".
 *
 * Shared primitive consumed by BigTimer, FocusTimer, SharedTimer.
 */
export function BatteryStrip({
  count,
  max = 8,
  scale = 1,
  gap = 3,
}: BatteryStripProps) {
  const w = Math.round(14 * scale);
  const h = Math.round(8 * scale);
  const nubW = Math.round(2 * scale);
  const nubH = Math.round(4 * scale);

  return (
    <div
      data-testid="battery-strip"
      style={{ display: "flex", gap, alignItems: "center" }}
    >
      {Array.from({ length: max }).map((_, i) => {
        const active = i < count;
        return (
          <div
            key={i}
            style={{
              display: "inline-flex",
              alignItems: "center",
              animation: active
                ? `batteryPulse 1.8s ease-in-out infinite`
                : undefined,
              animationDelay: active ? `${i * 0.14}s` : undefined,
            }}
          >
            {/* Battery body */}
            <div
              style={{
                width: w,
                height: h,
                border: `1px solid ${active ? "var(--green)" : "rgba(125, 211, 168, 0.15)"}`,
                background: active
                  ? "linear-gradient(135deg, rgba(125, 211, 168, 0.4) 0%, rgba(125, 211, 168, 0.2) 100%)"
                  : "rgba(255,255,255,0.03)",
                boxSizing: "border-box",
              }}
            />
            {/* Terminal nub */}
            <div
              style={{
                width: nubW,
                height: nubH,
                background: active ? "var(--green)" : "rgba(125, 211, 168, 0.15)",
                flexShrink: 0,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}


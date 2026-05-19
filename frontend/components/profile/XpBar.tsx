"use client";

import { useMemo, type CSSProperties } from "react";

/** Number of segmented cells in the XP bar. Kept here so the citizen
 *  card and the profile sidebar can never drift on width. */
export const XP_CELLS = 16;

interface XpBarProps {
  /** Current XP. When `null` the bar renders empty (no fill). */
  xp: number | null | undefined;
  /** XP needed to reach the next level. */
  xpNext: number | null | undefined;
  /** Optional label rendered below the bar. Pass `null` to omit. */
  label?: string | null;
  /** Forwarded to the wrapper for layout tweaks. */
  className?: string;
  style?: CSSProperties;
  /** A11y label for the bar itself. */
  ariaLabel?: string;
}

export function XpBar({ xp, xpNext, label, className, style, ariaLabel }: XpBarProps) {
  const filled = useMemo(() => {
    if (xp == null || xpNext == null || xpNext === 0) return 0;
    const ratio = Math.max(0, Math.min(1, xp / xpNext));
    return Math.round(ratio * XP_CELLS);
  }, [xp, xpNext]);

  return (
    <div className={className} style={style}>
      <div
        className="xp-bar"
        role="progressbar"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={xpNext ?? 0}
        aria-valuenow={xp ?? 0}
      >
        {Array.from({ length: XP_CELLS }).map((_, i) => (
          <span
            key={i}
            className={`xp-cell${i < filled ? " on" : ""}`}
            style={
              i < filled
                ? {
                    background:
                      "linear-gradient(90deg, var(--accent) 0%, var(--accent-2) 100%)",
                  }
                : undefined
            }
          />
        ))}
      </div>
      {label ? (
        <div
          className="font-silkscreen"
          style={{
            fontSize: 10,
            color: "var(--ink-dim)",
            letterSpacing: "0.15em",
            marginTop: 6,
          }}
        >
          {label}
        </div>
      ) : null}
    </div>
  );
}

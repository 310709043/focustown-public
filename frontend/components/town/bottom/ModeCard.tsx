"use client";

import type { CSSProperties, ReactNode } from "react";

interface ModeCardProps {
  /** Stable test id ("mode-card-solo" / "mode-card-together"). */
  testId: string;
  /** Top-row glyph (emoji or short symbol). Sits above the title. */
  icon: ReactNode;
  /** Mode name — Silkscreen all-caps. */
  title: string;
  /** Single-line description. Reads as the mode's purpose. */
  description: string;
  /** Bottom CTA label, e.g. "Enter ▶". */
  ctaLabel: string;
  /** ARIA label for the CTA. */
  ctaAriaLabel: string;
  /** CTA click. */
  onCta: () => void;
  /** Optional accent override (defaults to `--accent-3` slate). */
  accentVar?: string;
  /** Optional small badge in the top-right corner (e.g. partner name). */
  badge?: ReactNode;
  /** Optional extra row above the CTA — e.g. recent-match avatars. */
  extra?: ReactNode;
  /** Disable the CTA (e.g. while a match request is in flight). */
  disabled?: boolean;
  /** Cursor while disabled (defaults to "wait"). */
  disabledCursor?: CSSProperties["cursor"];
  /** Optional aria-label for the card surface (defaults to `${title} mode`). */
  cardAriaLabel?: string;
}

/**
 * Single mode tile rendered inside the BottomHUD center column.
 *
 * Two of these live side-by-side: Solo + Together. The active "you're
 * already here" City mode is communicated by the ModeStatusBar above
 * the HUD, not by a third card — the user's current location IS the
 * city, so showing it as an option to "enter" would be misleading.
 */
export function ModeCard({
  testId,
  icon,
  title,
  description,
  ctaLabel,
  ctaAriaLabel,
  onCta,
  accentVar = "var(--accent-3)",
  badge,
  extra,
  disabled = false,
  disabledCursor = "wait",
  cardAriaLabel,
}: ModeCardProps) {
  return (
    <div
      data-testid={testId}
      role="group"
      aria-label={cardAriaLabel ?? `${title} mode`}
      className="pixel-panel"
      style={{
        position: "relative",
        padding: "8px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 0,
        borderColor: accentVar,
        boxShadow: `0 0 6px ${accentVar}, inset 0 0 12px rgba(0,0,0,0.4)`,
      }}
    >
      {/* Header row: icon + (optional) badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: 18,
        }}
      >
        <span
          aria-hidden
          className="font-silkscreen"
          style={{
            fontSize: 14,
            color: accentVar,
            textShadow: `0 0 6px ${accentVar}`,
            letterSpacing: "0.1em",
          }}
        >
          {icon}
        </span>
        {badge ? (
          <span
            className="font-silkscreen"
            style={{
              fontSize: 8,
              color: "var(--ink-dim)",
              letterSpacing: "0.15em",
              maxWidth: 90,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {badge}
          </span>
        ) : null}
      </div>

      <div
        className="font-silkscreen"
        style={{
          fontSize: 12,
          color: accentVar,
          letterSpacing: "0.18em",
          lineHeight: 1.1,
        }}
      >
        {title}
      </div>

      <div
        className="font-silkscreen"
        style={{
          fontSize: 9,
          color: "var(--ink-mute)",
          letterSpacing: "0.06em",
          lineHeight: 1.4,
          flex: 1,
          minHeight: 24,
          // Allow 2 lines without ellipsis on desktop; mobile gets a tooltip via title.
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
        title={description}
      >
        {description}
      </div>

      {extra ? <div style={{ minHeight: 22 }}>{extra}</div> : null}

      <button
        type="button"
        data-testid={`${testId}-cta`}
        onClick={onCta}
        disabled={disabled}
        aria-label={ctaAriaLabel}
        className="pixel-btn"
        style={{
          marginTop: "auto",
          padding: "6px 8px",
          fontSize: 11,
          letterSpacing: "0.18em",
          borderColor: accentVar,
          color: accentVar,
          opacity: disabled ? 0.55 : 1,
          cursor: disabled ? disabledCursor : "pointer",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {ctaLabel}
      </button>
    </div>
  );
}

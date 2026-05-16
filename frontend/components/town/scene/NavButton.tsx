"use client";

import type { ReactNode } from "react";

interface NavButtonProps {
  /** Optional pixel-sprite or string icon. */
  icon?: ReactNode;
  label: string;
  onClick?: () => void;
  /** Wrap as `<a>` for routed nav (no client JS needed). */
  href?: string;
  testId?: string;
  /** Renders the button greyed-out, ignores clicks, and skips hover styling. */
  disabled?: boolean;
  /** Native tooltip — used to surface "Coming soon" on disabled entries. */
  title?: string;
}

/**
 * Compact silkscreen-cased nav button used in the top HUD's right
 * cluster (ACHV / SHOP / FRDS) and reusable anywhere a compact pixel
 * button with optional sprite icon is needed.
 */
export function NavButton({
  icon,
  label,
  onClick,
  href,
  testId,
  disabled,
  title,
}: NavButtonProps) {
  const inner = (
    <>
      {icon ? (
        typeof icon === "string" ? (
          <span style={{ fontSize: 11 }}>{icon}</span>
        ) : (
          icon
        )
      ) : null}
      <span>{label}</span>
    </>
  );

  const baseStyle = {
    background: "rgba(7,4,26,0.75)",
    border: "1px solid var(--panel-stroke)",
    padding: "6px 10px",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 9,
    color: "var(--ink-mute)",
    letterSpacing: "0.15em",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1,
    transition: "all 0.12s steps(2)",
    textDecoration: "none",
  } as const;

  if (href && !disabled) {
    return (
      <a
        href={href}
        data-testid={testId}
        title={title}
        className="font-silkscreen"
        style={baseStyle}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "var(--accent)";
          e.currentTarget.style.color = "var(--ink)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "var(--panel-stroke)";
          e.currentTarget.style.color = "var(--ink-mute)";
        }}
      >
        {inner}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title}
      data-testid={testId}
      className="font-silkscreen"
      style={baseStyle}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.borderColor = "var(--accent)";
        e.currentTarget.style.color = "var(--ink)";
      }}
      onMouseLeave={(e) => {
        if (disabled) return;
        e.currentTarget.style.borderColor = "var(--panel-stroke)";
        e.currentTarget.style.color = "var(--ink-mute)";
      }}
    >
      {inner}
    </button>
  );
}

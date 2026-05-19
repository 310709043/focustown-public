"use client";

import { type ReactNode } from "react";

interface ProfileNavItemProps {
  icon: ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  testId?: string;
}

export function ProfileNavItem({
  icon,
  label,
  active = false,
  disabled = false,
  onClick,
  testId,
}: ProfileNavItemProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={disabled ? undefined : onClick}
      aria-current={active ? "page" : undefined}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      className="font-silkscreen"
      style={{
        display: "grid",
        gridTemplateColumns: "20px 1fr 12px",
        alignItems: "center",
        columnGap: 12,
        padding: "10px 14px",
        width: "100%",
        textAlign: "left",
        background: active
          ? "linear-gradient(90deg, rgba(167,139,250,0.18) 0%, rgba(167,139,250,0.04) 100%)"
          : "transparent",
        border: "none",
        borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
        color: active ? "var(--accent)" : disabled ? "var(--ink-dim)" : "var(--ink-mute)",
        letterSpacing: "0.22em",
        fontSize: 12,
        cursor: disabled ? "not-allowed" : "pointer",
        textShadow: active ? "0 0 10px var(--accent)" : undefined,
        transition: "background-color 160ms ease, color 160ms ease",
      }}
      onMouseEnter={(e) => {
        if (active || disabled) return;
        e.currentTarget.style.background = "rgba(167,139,250,0.06)";
        e.currentTarget.style.color = "var(--ink)";
      }}
      onMouseLeave={(e) => {
        if (active || disabled) return;
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--ink-mute)";
      }}
    >
      <span aria-hidden style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        {icon}
      </span>
      <span>{label}</span>
      <span
        aria-hidden
        style={{
          color: "var(--accent)",
          opacity: active ? 1 : 0,
          transform: active ? "translateX(0)" : "translateX(-4px)",
          transition: "opacity 200ms ease, transform 200ms ease",
        }}
      >
        ▶
      </span>
    </button>
  );
}

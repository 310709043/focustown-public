"use client";

import type { ReactNode } from "react";

interface NavButtonProps {
  /** Optional pixel-sprite or string icon. */
  icon?: ReactNode;
  label: string;
  onClick?: () => void;
  /** Wrap as `<a>` for routed nav (no client JS needed). */
  href?: string;
  /** Open the `href` in a new tab (external links — e.g. donate). */
  newTab?: boolean;
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
  newTab,
  testId,
  disabled,
  title,
}: NavButtonProps) {
  const inner = (
    <>
      {icon ? (
        typeof icon === "string" ? (
          <span style={{ fontSize: 13 }}>{icon}</span>
        ) : (
          icon
        )
      ) : null}
      <span>{label}</span>
    </>
  );

  const baseStyle = {
    background: "linear-gradient(180deg, rgba(16, 22, 40, 0.8) 0%, rgba(12, 16, 32, 0.8) 100%)",
    border: "1px solid var(--border)",
    padding: "10px 14px",
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    minHeight: 44,
    fontSize: 11,
    color: "var(--dim)",
    letterSpacing: "0.15em",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.35 : 1,
    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
    textDecoration: "none",
    borderRadius: "var(--r)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
  } as const;

  const hoverHandlers = {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      if (disabled) return;
      e.currentTarget.style.borderColor = "var(--a1-soft)";
      e.currentTarget.style.color = "var(--text)";
      e.currentTarget.style.background = "linear-gradient(180deg, rgba(233, 167, 110, 0.12) 0%, rgba(233, 167, 110, 0.06) 100%)";
      e.currentTarget.style.boxShadow = "0 0 16px rgba(233, 167, 110, 0.15)";
      e.currentTarget.style.transform = "translateY(-1px)";
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      if (disabled) return;
      e.currentTarget.style.borderColor = "var(--border)";
      e.currentTarget.style.color = "var(--dim)";
      e.currentTarget.style.background = "linear-gradient(180deg, rgba(16, 22, 40, 0.8) 0%, rgba(12, 16, 32, 0.8) 100%)";
      e.currentTarget.style.boxShadow = "none";
      e.currentTarget.style.transform = "none";
      e.currentTarget.classList.remove("nav-btn-press");
    },
    onMouseDown: (e: React.MouseEvent<HTMLElement>) => {
      if (disabled) return;
      e.currentTarget.classList.remove("nav-btn-press");
      // Force reflow so re-adding the class restarts the animation
      void e.currentTarget.offsetWidth;
      e.currentTarget.classList.add("nav-btn-press");
    },
    onMouseUp: (e: React.MouseEvent<HTMLElement>) => {
      if (disabled) return;
      e.currentTarget.classList.remove("nav-btn-press");
    },
  };

  if (href && !disabled) {
    return (
      <a
        href={href}
        target={newTab ? "_blank" : undefined}
        rel={newTab ? "noopener noreferrer" : undefined}
        data-testid={testId}
        title={title}
        className="font-silkscreen"
        style={baseStyle}
        {...hoverHandlers}
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
      {...hoverHandlers}
    >
      {inner}
    </button>
  );
}

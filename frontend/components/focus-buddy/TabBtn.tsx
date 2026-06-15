"use client";

import type { ReactNode } from "react";

interface TabBtnProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  /** Forwarded to `data-tab` for E2E selectors. */
  tabId?: string;
}

/**
 * Reused-pattern tab button — accent fill + dark ink active; transparent
 * + ink-mute inactive. Same shape as Page 2 TabBar's TabButton + Page 3
 * SkyWindow TabPill, kept local here per SRP (avoids cross-page coupling).
 *
 * Reference: screen-buddy.jsx:L303-L314.
 */
export function TabBtn({ active, onClick, children, tabId }: TabBtnProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      data-active={active || undefined}
      data-tab={tabId}
      className="font-silkscreen"
      style={{
        padding: "5px 12px",
        background: active ? "var(--accent)" : "transparent",
        color: active ? "#0a0524" : "var(--ink-mute)",
        border: `1px solid ${active ? "var(--accent)" : "var(--panel-stroke)"}`,
        fontSize: 11,
        letterSpacing: "0.1em",
        cursor: "pointer",
        transition:
          "background 150ms ease, color 150ms ease, border-color 150ms ease, transform 60ms ease",
      }}
    >
      {children}
    </button>
  );
}

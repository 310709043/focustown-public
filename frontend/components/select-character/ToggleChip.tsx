"use client";

import type { ReactNode } from "react";

interface ToggleChipProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  /** Override active color for the skill variant (accent-3). */
  color?: string;
}

/**
 * Single multi-select chip. Background flips to `color` (default
 * accent purple) when active; inactive state uses muted text + light
 * border. Reference applies a soft glow on active.
 */
export function ToggleChip({ active, onClick, children, color }: ToggleChipProps) {
  const c = color ?? "var(--accent)";
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active || undefined}
      className="font-silkscreen"
      style={{
        padding: "6px 10px",
        background: active ? c : "rgba(0,0,0,0.3)",
        color: active ? "#0a0524" : "var(--ink-mute)",
        border: `1px solid ${active ? c : "var(--panel-stroke)"}`,
        fontSize: 11,
        letterSpacing: "0.05em",
        cursor: "pointer",
        whiteSpace: "nowrap",
        boxShadow: active ? `0 0 8px ${c}66` : "none",
        transition: "all 0.12s steps(2)",
      }}
    >
      {children}
    </button>
  );
}

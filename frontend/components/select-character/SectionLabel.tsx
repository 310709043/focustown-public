"use client";

import type { ReactNode } from "react";

/**
 * Tiny LED-dot + label header. Reference puts one before each form
 * field and each tab section so the eye can scan ports/sections.
 */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      className="font-silkscreen"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 11,
        color: "var(--accent)",
        letterSpacing: "0.2em",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          background: "var(--accent)",
          boxShadow: "var(--neon-glow)",
        }}
      />
      {children}
    </div>
  );
}

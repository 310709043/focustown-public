"use client";

import type { ReactNode } from "react";

/** Tiny cyan-bordered tag chip — used by `<BuddyCard>` to show
 *  the buddy's task tags (`#寫作`, `#lofi`, …). Reference: screen-buddy.jsx:L254-L262. */
export function Pill({ children }: { children: ReactNode }) {
  return (
    <span
      className="font-silkscreen"
      style={{
        fontSize: 8,
        padding: "1px 5px",
        background: "rgba(34,211,238,0.1)",
        border: "1px solid var(--accent-3)",
        color: "var(--accent-3)",
        letterSpacing: "0.1em",
      }}
    >
      {children}
    </span>
  );
}

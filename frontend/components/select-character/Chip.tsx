"use client";

import type { ReactNode } from "react";

/**
 * Caption-sized outlined chip — `LV.1`, age, `NEW`, etc. Border + text
 * color both flow from the optional `color` prop so a single chip can
 * read as informational (default) or accented (NEW marker).
 */
export function Chip({
  children,
  color,
}: {
  children: ReactNode;
  color?: string;
}) {
  return (
    <span
      className="font-silkscreen"
      style={{
        fontSize: 9,
        padding: "2px 5px",
        border: `1px solid ${color ?? "var(--panel-stroke)"}`,
        color: color ?? "var(--ink-mute)",
        letterSpacing: "0.1em",
      }}
    >
      {children}
    </span>
  );
}

"use client";

import { useEffect, useState } from "react";

const BAR_COUNT = 8;
const TICK_MS = 150;

interface EQVizProps {
  playing: boolean;
}

/**
 * Eight thin cyan bars cycling height every 150 ms while `playing`.
 * Pure animation primitive — no audio dependency. SRP-extracted because
 * Page 5 buddy room's `<RoomMusic>` consumes the same shape verbatim.
 */
export function EQViz({ playing }: EQVizProps) {
  const [bars, setBars] = useState<number[]>(() =>
    Array.from({ length: BAR_COUNT }, (_, i) => 3 + ((i * 7) % 7)),
  );

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setBars((prev) => prev.map(() => 2 + Math.floor(Math.random() * 8)));
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [playing]);

  return (
    <div
      data-testid="eqviz"
      style={{
        display: "flex",
        gap: 1,
        alignItems: "flex-end",
        height: 14,
      }}
    >
      {bars.map((h, i) => (
        <div
          key={i}
          style={{
            width: 2,
            height: h,
            background: "var(--accent-3)",
            boxShadow: "var(--neon-glow-cyan)",
          }}
        />
      ))}
    </div>
  );
}

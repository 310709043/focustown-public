"use client";

import { useEffect, useState } from "react";

/**
 * Three cyan dots cycling 350 ms — the "buddy is typing" indicator
 * in `<StatusMini>`. Reference: screen-buddy.jsx:L265-L278.
 */
export function TypingDots() {
  const [d, setD] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setD((x) => (x + 1) % 4), 350);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div style={{ display: "flex", gap: 2 }} aria-hidden>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 4,
            height: 4,
            background: i < d ? "var(--accent-3)" : "var(--panel-stroke)",
            boxShadow: i < d ? "var(--neon-glow-cyan)" : "none",
          }}
        />
      ))}
    </div>
  );
}

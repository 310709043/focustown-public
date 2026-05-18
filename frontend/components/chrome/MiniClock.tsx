"use client";

import { useEffect, useState } from "react";

const WD = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MN = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

/**
 * Pixel-CRT mini clock used by both the town top HUD and the focus
 * room top bar. Ticks once per 30 s — minute resolution is enough for
 * focus contexts, and a 30 s cadence avoids the visible 60 s "minute
 * boundary" lag on slow systems.
 *
 * SSR safe — the first paint shows blank, and the time renders only
 * after `useEffect` runs client-side. This sidesteps the hydration
 * gotcha catalogued in memory (`hydration-gotchas`) where Date()
 * during SSR diverges from client locale.
 */
export function MiniClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  if (!now) return null;

  return (
    <div
      data-testid="mini-clock"
      className="pixel-panel"
      style={{
        padding: "6px 10px",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          lineHeight: 1,
        }}
      >
        <div
          className="font-silkscreen"
          style={{
            fontSize: 16,
            color: "var(--ink)",
            letterSpacing: "0.05em",
          }}
        >
          {String(now.getHours()).padStart(2, "0")}:
          {String(now.getMinutes()).padStart(2, "0")}
        </div>
        <div
          className="font-silkscreen"
          style={{
            fontSize: 8,
            color: "var(--ink-mute)",
            letterSpacing: "0.18em",
          }}
        >
          {WD[now.getDay()]} · {MN[now.getMonth()]} {now.getDate()}
        </div>
      </div>
    </div>
  );
}

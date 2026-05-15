"use client";

import { useEffect, useState } from "react";

/**
 * Pixel airplane: 3 stacked rectangles (body, wings, blinking tail light).
 * Loops left → right across the scene every `intervalSeconds` with a random
 * vertical offset, then disappears. Use one per scene; multiple instances OK.
 */

type Props = {
  topPercent?: number;       // 0-40 (% of parent height)
  intervalSeconds?: number;  // total cycle duration
  delaySeconds?: number;     // pre-roll
};

// Deterministic default vertical offset. Picking a random value during the
// initial render breaks SSR hydration (server and client roll different
// numbers). We start at a fixed mid-air position and reroll in useEffect
// after mount, where divergence is allowed.
const DEFAULT_TOP_PERCENT = 20;

export function Airplane({
  topPercent,
  intervalSeconds = 22,
  delaySeconds = 0,
}: Props) {
  const [top, setTop] = useState<number>(topPercent ?? DEFAULT_TOP_PERCENT);

  useEffect(() => {
    if (topPercent !== undefined) return;
    // Initial post-mount randomise so the first loop isn't identical
    // across page loads, then keep rerolling each loop.
    setTop(8 + Math.random() * 24);
    const id = setInterval(
      () => setTop(8 + Math.random() * 24),
      intervalSeconds * 1000,
    );
    return () => clearInterval(id);
  }, [topPercent, intervalSeconds]);

  return (
    <div
      className="absolute pointer-events-none z-[3] animate-airplane"
      style={
        {
          top: `${top}%`,
          // String "0%" rather than number 0 — React serialises numeric 0
          // without a unit but Next's SSR emits "0px", which triggers a
          // hydration mismatch on this attribute.
          left: "0%",
          ["--ap-dur" as string]: `${intervalSeconds}s`,
          ["--ap-delay" as string]: `${delaySeconds}s`,
        } as React.CSSProperties
      }
      aria-hidden
    >
      <div className="relative" style={{ width: 28, height: 12 }}>
        {/* fuselage */}
        <div
          style={{
            position: "absolute",
            left: 4,
            top: 4,
            width: 20,
            height: 3,
            background: "#e2d9f3",
            boxShadow: "0 0 4px rgba(255,255,255,0.6)",
          }}
        />
        {/* cockpit window */}
        <div
          style={{
            position: "absolute",
            left: 20,
            top: 4,
            width: 3,
            height: 2,
            background: "#60a5fa",
          }}
        />
        {/* wing */}
        <div
          style={{
            position: "absolute",
            left: 9,
            top: 7,
            width: 10,
            height: 2,
            background: "#c4b5fd",
          }}
        />
        {/* tail fin */}
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 3,
            height: 4,
            background: "#c4b5fd",
          }}
        />
        {/* blinking tail beacon (red) */}
        <div
          className="animate-airplaneBlink"
          style={{
            position: "absolute",
            left: 0,
            top: 4,
            width: 2,
            height: 2,
            background: "#fb7185",
            boxShadow: "0 0 6px #fb7185",
            borderRadius: "50%",
          }}
        />
        {/* contrail */}
        <div
          style={{
            position: "absolute",
            left: 24,
            top: 5,
            width: 60,
            height: 1,
            background:
              "linear-gradient(90deg, rgba(226,217,243,0.7), transparent)",
            opacity: 0.6,
          }}
        />
      </div>
    </div>
  );
}

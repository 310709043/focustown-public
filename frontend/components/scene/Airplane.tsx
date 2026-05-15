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

export function Airplane({
  topPercent,
  intervalSeconds = 22,
  delaySeconds = 0,
}: Props) {
  // Start with a stable, deterministic value so SSR + CSR initial renders
  // agree. The client randomises in the effect below, which never runs on
  // the server. This avoids hydration mismatches that would otherwise fire
  // on every page load (Math.random() returns different values per call).
  const initialTop = topPercent ?? 20;
  const [top, setTop] = useState<number>(initialTop);

  // Reroll vertical offset each loop for variety. First reroll happens on
  // mount so the random plane heights still kick in immediately.
  useEffect(() => {
    if (topPercent !== undefined) return;
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
          // without a unit but Next's SSR emits "0px", which produces a
          // hydration mismatch on this attribute even when `top` is stable.
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

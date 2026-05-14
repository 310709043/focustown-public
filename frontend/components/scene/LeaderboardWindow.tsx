"use client";

import { LeaderboardPanel } from "@/components/panels/LeaderboardPanel";

/**
 * Top-center "city window" that floats over the skyline. Visually it reads as
 * one giant illuminated building window — a pixel pane with neon-edged frame,
 * crossbar mullions, and a glow halo behind it. The leaderboard list lives
 * inside the pane.
 */
export function LeaderboardWindow() {
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 z-[5] pointer-events-none"
      style={{ top: 18, width: 288 }}
    >
      {/* halo glow behind the window */}
      <div
        aria-hidden
        className="absolute inset-0 -m-3"
        style={{
          borderRadius: 16,
          background:
            "radial-gradient(ellipse at center, rgba(167,139,250,0.25), transparent 70%)",
          filter: "blur(8px)",
        }}
      />

      {/* outer neon frame */}
      <div
        className="relative pixel-edge"
        style={{
          background:
            "linear-gradient(180deg, rgba(8,3,25,0.96), rgba(2,0,12,0.96))",
          border: "1px solid var(--a1)",
          boxShadow:
            "0 0 14px var(--a1), inset 0 0 12px rgba(167,139,250,0.18)",
          borderRadius: 6,
          padding: 0,
          pointerEvents: "auto",
        }}
      >
        {/* window crossbar — horizontal mullion under the header */}
        <div
          aria-hidden
          style={{
            height: 1,
            background: "var(--a1)",
            opacity: 0.6,
            position: "absolute",
            top: 26,
            left: 6,
            right: 6,
          }}
        />
        {/* window crossbar — vertical mullion through the title */}
        <div
          aria-hidden
          style={{
            width: 1,
            background: "var(--a1)",
            opacity: 0.4,
            position: "absolute",
            top: 4,
            bottom: 4,
            left: "50%",
          }}
        />

        {/* corner rivets */}
        {(["tl", "tr", "bl", "br"] as const).map((p) => (
          <span
            key={p}
            aria-hidden
            style={{
              position: "absolute",
              width: 4,
              height: 4,
              background: "var(--a2)",
              boxShadow: "0 0 6px var(--a1)",
              borderRadius: 1,
              top: p[0] === "t" ? -2 : "auto",
              bottom: p[0] === "b" ? -2 : "auto",
              left: p[1] === "l" ? -2 : "auto",
              right: p[1] === "r" ? -2 : "auto",
            }}
          />
        ))}

        {/* header strip */}
        <div
          className="font-pixel flex items-center justify-center gap-2"
          style={{
            fontSize: 8,
            letterSpacing: 2,
            color: "var(--a2)",
            padding: "8px 10px 6px",
            textShadow: "0 0 8px var(--a1), 0 0 18px var(--a3)",
          }}
        >
          <span style={{ fontSize: 10 }}>🏆</span>
          <span>TONIGHT&apos;S TOP 5</span>
          <span style={{ fontSize: 10 }}>🏆</span>
        </div>

        {/* body */}
        <div style={{ padding: "8px 12px 10px" }}>
          <LeaderboardPanel />
        </div>
      </div>
    </div>
  );
}

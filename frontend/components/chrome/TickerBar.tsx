"use client";

import { TICKER_MESSAGES } from "@/lib/data/ticker";

interface TickerBarProps {
  /** Full lap duration; longer = slower drift. */
  durationSeconds?: number;
  className?: string;
}

/**
 * Edge-to-edge horizontal news strip drifting right-to-left. The track
 * is rendered twice in sequence so the loop wraps without a visible
 * jump — when the first copy hits -100% translateX it lands exactly
 * where the second copy started.
 *
 * Sits in its own row above the bottom HUD, on the same z-band as
 * scene props.
 */
export function TickerBar({ durationSeconds = 60, className }: TickerBarProps) {
  const items = TICKER_MESSAGES;
  const renderLap = (key: string) => (
    <div
      key={key}
      style={{
        display: "flex",
        flex: "0 0 auto",
        gap: 48,
        paddingRight: 48,
        whiteSpace: "nowrap",
      }}
    >
      {items.map((m, i) => (
        <span
          key={`${key}-${i}`}
          className="font-pixel-en"
          style={{ fontSize: 12, color: "var(--dir-ink-mute)", letterSpacing: 1 }}
        >
          {m}
        </span>
      ))}
    </div>
  );

  return (
    <div
      className={className}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 188,
        height: 26,
        zIndex: 5,
        overflow: "hidden",
        background: "rgba(2,0,12,0.78)",
        borderTop: "1px solid var(--dir-panel-stroke)",
        borderBottom: "1px solid var(--dir-panel-stroke)",
        display: "flex",
        alignItems: "center",
        pointerEvents: "none",
      }}
    >
      {/* Left-pinned LIVE chip — reference layers a solid accent block
          with the 📡 LIVE label at the start of the ticker. Always
          visible regardless of marquee drift. Ref: screen-town.jsx:L1043-L1045. */}
      <div
        aria-hidden
        data-testid="ticker-live-pin"
        className="font-silkscreen"
        style={{
          flex: "0 0 auto",
          height: "100%",
          padding: "0 12px",
          background: "var(--accent)",
          color: "#0a0524",
          fontSize: 10,
          letterSpacing: "0.2em",
          display: "flex",
          alignItems: "center",
          zIndex: 1,
        }}
      >
        📡 LIVE
      </div>
      <div
        className="animate-drift"
        style={
          {
            display: "flex",
            flex: "0 0 auto",
            marginLeft: 12,
            ["--drift-dur" as string]: `${durationSeconds}s`,
          } as React.CSSProperties
        }
      >
        {renderLap("a")}
        {renderLap("b")}
      </div>
    </div>
  );
}

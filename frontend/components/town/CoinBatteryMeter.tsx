"use client";

import { formatMinor } from "@/lib/state/walletStore";

interface CoinBatteryMeterProps {
  balanceMinor: number;
  maxCells?: number;
}

/**
 * Visual battery meter representing T-coin balance. Each cell = 1 T (100 cT).
 * Fills left-to-right; partial last cell shown as proportional fill.
 */
export function CoinBatteryMeter({
  balanceMinor,
  maxCells = 10,
}: CoinBatteryMeterProps) {
  const fullCells = Math.min(Math.floor(balanceMinor / 100), maxCells);
  const partialFill =
    fullCells < maxCells ? Math.min((balanceMinor % 100) / 100, 1) : 0;
  const formatted = formatMinor("T", balanceMinor);

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      {/* Battery shell */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          border: "1px solid rgba(125,211,168,0.35)",
          borderRadius: 3,
          padding: 2,
          gap: 1,
          background: "rgba(0,0,0,0.3)",
        }}
      >
        {Array.from({ length: maxCells }).map((_, i) => {
          const isFull = i < fullCells;
          const isPartial = i === fullCells && partialFill > 0;
          const fillPct = isFull ? 1 : isPartial ? partialFill : 0;

          const cellColor =
            i < 3
              ? "var(--green)"
              : i < 7
                ? "var(--amber)"
                : "rgba(239,68,68,0.85)";

          return (
            <div
              key={i}
              style={{
                width: 10,
                height: 14,
                position: "relative",
                background: "rgba(255,255,255,0.04)",
                borderRadius: 1,
                overflow: "hidden",
              }}
            >
              {fillPct > 0 && (
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    width: "100%",
                    height: `${fillPct * 100}%`,
                    background: cellColor,
                    opacity: 0.8,
                    boxShadow: isFull
                      ? `0 0 4px ${cellColor}`
                      : undefined,
                  }}
                />
              )}
            </div>
          );
        })}
        {/* Terminal nub */}
        <div
          style={{
            width: 3,
            height: 8,
            background:
              fullCells > 0
                ? "rgba(125,211,168,0.5)"
                : "rgba(125,211,168,0.15)",
            borderRadius: "0 2px 2px 0",
            marginLeft: 1,
          }}
        />
      </div>
      {/* Numeric label */}
      <span
        style={{
          fontFamily: "var(--font-vt323), monospace",
          fontSize: 11,
          color: "var(--amber)",
          letterSpacing: 0.5,
          opacity: 0.85,
        }}
      >
        {formatted} T
      </span>
    </div>
  );
}

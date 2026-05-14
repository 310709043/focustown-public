"use client";

/**
 * Small 96×72 pixel window high on the right wall. The dark interior with
 * a single twinkling star reads as the street weather seen from inside —
 * it visually anchors the room to the same town outside.
 */
export function OutsideWindow() {
  return (
    <div
      className="absolute"
      style={{
        right: "12%",
        top: "14%",
        width: 96,
        height: 72,
        border: "2px solid var(--a3)",
        background: "linear-gradient(180deg, #04020e 0%, #0a0420 100%)",
        boxShadow:
          "0 0 14px rgba(167,139,250,0.25), inset 0 0 18px rgba(167,139,250,0.15)",
        imageRendering: "pixelated",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(90deg, transparent 47%, var(--a3) 47% 53%, transparent 53%), linear-gradient(0deg, transparent 47%, var(--a3) 47% 53%, transparent 53%)",
          pointerEvents: "none",
        }}
      />
      <div
        className="animate-twinkle"
        style={{
          position: "absolute",
          top: 16,
          left: 18,
          width: 3,
          height: 3,
          background: "var(--a2)",
          boxShadow: "0 0 4px var(--a1), 0 0 10px var(--a3)",
        }}
      />
    </div>
  );
}

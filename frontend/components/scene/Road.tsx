"use client";

/**
 * Neon pixel asphalt that anchors Pedestrians (sidewalk at bottom 104px)
 * to CarsLane (cars at bottom 57px, height 56px). The wrapper occupies
 * a 64px-tall band from bottom 50 → 114 so cars visually drive on its
 * surface while the dashed center line drifts under them.
 *
 * Pure CSS — no JS, no rAF, no image assets. The single animation
 * (`roadDash`) is GPU-friendly (background-position-x only) and respects
 * the global `prefers-reduced-motion` collapse in globals.css.
 */
export function Road() {
  return (
    <div
      className="absolute left-0 right-0 z-[5] pointer-events-none"
      style={{ bottom: 50, height: 64 }}
      aria-hidden
    >
      {/* asphalt base + scanline texture */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, #0a0420 0%, #0d0628 50%, #0a0420 100%), " +
            "repeating-linear-gradient(180deg, rgba(255,255,255,0.012) 0 1px, transparent 1px 3px)",
          backgroundBlendMode: "normal, overlay",
          boxShadow:
            "inset 0 1px 0 rgba(167,139,250,0.08), inset 0 -1px 0 rgba(167,139,250,0.08)",
        }}
      />

      {/* top curb — neon purple */}
      <div
        className="absolute left-0 right-0"
        style={{
          top: 0,
          height: 2,
          background: "var(--a3)",
          boxShadow:
            "0 0 6px var(--a1), 0 0 12px rgba(167,139,250,0.35)",
        }}
      />

      {/* bottom curb — neon purple */}
      <div
        className="absolute left-0 right-0"
        style={{
          bottom: 0,
          height: 2,
          background: "var(--a3)",
          boxShadow:
            "0 0 6px var(--a1), 0 0 12px rgba(167,139,250,0.35)",
        }}
      />

      {/* dashed center line — slow leftward drift via background-position */}
      <div
        className="absolute left-0 right-0 animate-roadDash"
        style={{
          top: "50%",
          marginTop: -1,
          height: 2,
          backgroundImage:
            "repeating-linear-gradient(90deg, var(--a2) 0 24px, transparent 24px 48px)",
          backgroundSize: "48px 2px",
          opacity: 0.55,
          filter: "drop-shadow(0 0 4px var(--a1))",
        }}
      />
    </div>
  );
}

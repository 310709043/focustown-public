"use client";

/**
 * Neon pixel ground band. The road now anchors at the visible bottom of
 * the scene (just above the BottomHUD) instead of floating mid-screen,
 * so the city silhouette in `SceneBackdrop` reads as sitting *on* the
 * road rather than wrapped around a hovering strip.
 *
 * Layout (from the band's top down):
 *   ┌─ top curb (neon purple, 2 px)
 *   │  sidewalk strip — 30 px      ← Pedestrians / NamedWalkers / StreetProps
 *   ├─ curb divider (neon purple, 2 px)
 *   │  asphalt — 90 px              ← CarsLane / NamedCars with dashed centerline
 *   └─ bottom curb (neon purple, 2 px)
 *
 * Pure CSS — no JS, no rAF, no image assets. The single animation
 * (`roadDash`) is GPU-friendly (background-position-x only) and respects
 * the global `prefers-reduced-motion` collapse in globals.css.
 */
export function Road() {
  return (
    <div
      className="absolute left-0 right-0 z-[5] pointer-events-none ground-anchor"
      style={{ bottom: "calc(168px - var(--ground-shift, 0px))", height: 120 }}
      aria-hidden
    >
      {/* sidewalk strip (top 30 px) — slightly lighter panel tone so it
          reads as raised pavement against the asphalt below. */}
      <div
        className="absolute left-0 right-0"
        style={{
          top: 0,
          height: 30,
          background:
            "linear-gradient(180deg, #1a1240 0%, #150e36 100%), " +
            "repeating-linear-gradient(90deg, rgba(167,139,250,0.06) 0 2px, transparent 2px 6px)",
          backgroundBlendMode: "normal, overlay",
        }}
      />

      {/* asphalt body (bottom 90 px) */}
      <div
        className="absolute left-0 right-0"
        style={{
          top: 30,
          bottom: 0,
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

      {/* sidewalk/asphalt divider — neon purple */}
      <div
        className="absolute left-0 right-0"
        style={{
          top: 30,
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

      {/* dashed center line — slow leftward drift via background-position.
          Centered on the asphalt body (top 30 → 120 means middle ≈ 75). */}
      <div
        className="absolute left-0 right-0 animate-roadDash"
        style={{
          top: 75,
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

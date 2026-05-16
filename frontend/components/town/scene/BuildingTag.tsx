"use client";

interface BuildingTagProps {
  label: string;
  /** Index in the building row; controls the accent color rotation
   *  (accent / accent-2 / accent-3 / accent-4) and the staggered
   *  animation delay so adjacent tags float out of phase. */
  idx: number;
}

const COLORS = [
  "var(--accent)",
  "var(--accent-2)",
  "var(--accent-3)",
  "var(--accent-4)",
];

/**
 * Small floating label above each named building. The color cycles
 * through four accents; reference uses `pixelFloat` (4-step bob) and
 * a small mast dropping from the bottom-center.
 */
export function BuildingTag({ label, idx }: BuildingTagProps) {
  const c = COLORS[idx % COLORS.length];
  return (
    <div
      className="font-silkscreen animate-pixelFloat"
      style={{
        padding: "3px 8px",
        background: "rgba(7,4,26,0.92)",
        border: `1.5px solid ${c}`,
        color: c,
        fontSize: 9,
        letterSpacing: "0.15em",
        boxShadow: `0 0 10px ${c}66`,
        textShadow: `0 0 4px ${c}`,
        whiteSpace: "nowrap",
        position: "relative",
        animationDelay: `${idx * 0.18}s`,
        zIndex: 5,
      }}
    >
      {label}
      <span
        aria-hidden
        style={{
          position: "absolute",
          bottom: -6,
          left: "50%",
          transform: "translateX(-50%)",
          width: 2,
          height: 6,
          background: c,
        }}
      />
    </div>
  );
}

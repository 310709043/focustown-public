"use client";

/**
 * Pixel-art FT monogram. Composed of CSS-grid 5x5 pixel blocks per letter
 * — no SVG or image asset. Scale via the `scale` prop; glow via `glow`.
 */

type Props = {
  scale?: number;       // 1 = base (~32px tall), 2 = double, etc.
  glow?: boolean;
  className?: string;
};

// Each letter is a 5-row × 5-col grid of 0/1 pixels.
const F_GRID = [
  [1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0],
  [1, 1, 1, 1, 0],
  [1, 0, 0, 0, 0],
  [1, 0, 0, 0, 0],
];

const T_GRID = [
  [1, 1, 1, 1, 1],
  [0, 0, 1, 0, 0],
  [0, 0, 1, 0, 0],
  [0, 0, 1, 0, 0],
  [0, 0, 1, 0, 0],
];

function Letter({ grid, px }: { grid: number[][]; px: number }) {
  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: `repeat(5, ${px}px)`,
        gridTemplateRows: `repeat(5, ${px}px)`,
        gap: 1,
      }}
    >
      {grid.flatMap((row, ri) =>
        row.map((cell, ci) => (
          <span
            key={`${ri}-${ci}`}
            style={{
              width: px,
              height: px,
              background: cell ? "var(--a2)" : "transparent",
              boxShadow: cell
                ? "inset 0 -1px 0 0 rgba(0,0,0,0.35), 0 0 6px rgba(196,181,253,0.4)"
                : "none",
            }}
          />
        )),
      )}
    </div>
  );
}

export function Logo({ scale = 1, glow = true, className }: Props) {
  const px = Math.max(2, Math.round(4 * scale));
  return (
    <div
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: px,
        filter: glow
          ? "drop-shadow(0 0 6px var(--a1)) drop-shadow(0 0 12px var(--a3))"
          : "none",
      }}
      aria-label="Focus Town"
    >
      <Letter grid={F_GRID} px={px} />
      <Letter grid={T_GRID} px={px} />
    </div>
  );
}

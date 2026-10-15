import type { Energy } from "@/lib/lbt/types";

/** A small battery with one bar per social-battery level; colour comes from CSS. */
export function EnergyGlyph({ level }: { level: Energy }) {
  return (
    <svg className="energy-glyph" viewBox="0 0 16 10" aria-hidden="true" focusable="false">
      <rect x="0.5" y="0.5" width="12" height="9" rx="2" fill="none" stroke="currentColor" />
      <rect x="13.4" y="3" width="1.8" height="4" rx="0.6" fill="currentColor" />
      {[0, 1, 2].slice(0, level).map((i) => (
        <rect key={i} x={2 + i * 3.4} y="2" width="2.6" height="6" rx="0.8" fill="currentColor" />
      ))}
    </svg>
  );
}

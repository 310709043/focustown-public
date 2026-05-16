"use client";

interface AgeSliderProps {
  age: number;
  onChange: (next: number) => void;
}

/** Reference's age slider — value 10–99, glowing big number, +/- buttons,
 *  native range below, and tiny min/max captions. */
export function AgeSlider({ age, onChange }: AgeSliderProps) {
  const clamp = (n: number) => Math.max(10, Math.min(99, n));
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <span
          className="font-silkscreen tabular-nums"
          style={{
            fontSize: 20,
            color: "var(--accent)",
            textShadow: "var(--neon-glow)",
          }}
        >
          {age}
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            type="button"
            aria-label="decrement age"
            className="pixel-btn"
            style={{ padding: "2px 8px", fontSize: 11 }}
            onClick={() => onChange(clamp(age - 1))}
          >
            -
          </button>
          <button
            type="button"
            aria-label="increment age"
            className="pixel-btn"
            style={{ padding: "2px 8px", fontSize: 11 }}
            onClick={() => onChange(clamp(age + 1))}
          >
            +
          </button>
        </div>
      </div>
      <input
        type="range"
        min={10}
        max={99}
        value={age}
        onChange={(e) => onChange(Number(e.target.value))}
        className="age-slider"
        style={{ width: "100%" }}
      />
      <div
        className="font-silkscreen"
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 8,
          color: "var(--ink-dim)",
        }}
      >
        <span>10</span>
        <span>99</span>
      </div>
    </div>
  );
}

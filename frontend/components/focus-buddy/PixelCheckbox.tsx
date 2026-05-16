"use client";

/**
 * 14 × 14 cyan-bordered checkbox with dark ✓ glyph when checked.
 * Extracted from Page 4 `TasksPanel`'s inline checkbox so `<SharedAgenda>`
 * can reuse without duplication.
 *
 * Reference (Page 4): screen-focus.jsx:L512-L519
 * Reference (Page 5): screen-buddy.jsx:L175-L181
 */
interface PixelCheckboxProps {
  checked: boolean;
  onToggle: () => void;
  label?: string;
}

export function PixelCheckbox({ checked, onToggle, label }: PixelCheckboxProps) {
  return (
    <span
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onToggle();
        }
      }}
      style={{
        width: 14,
        height: 14,
        border: "1px solid var(--accent-3)",
        background: checked ? "var(--accent-3)" : "transparent",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      {checked ? (
        <span
          style={{ color: "#0a0524", fontSize: 10, fontWeight: 700, lineHeight: 1 }}
        >
          ✓
        </span>
      ) : null}
    </span>
  );
}

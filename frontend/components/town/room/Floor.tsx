"use client";

/**
 * Floor occupies the bottom 38%. The 1px amber skirting board at its top
 * edge is what most strongly sells the "interior" read — without it the
 * scene reads as outdoors. The thin reflection band underneath visually
 * anchors the plaque above it.
 */
export function Floor() {
  return (
    <div
      className="absolute left-0 right-0 bottom-0"
      style={{
        height: "38%",
        background: "linear-gradient(180deg, #0a0418 0%, #050010 100%)",
        backgroundImage:
          "linear-gradient(180deg, #0a0418 0%, #050010 100%), repeating-linear-gradient(0deg, transparent 0 11px, rgba(167,139,250,0.06) 11px 12px)",
        backgroundBlendMode: "normal",
        borderTop: "1px solid var(--a3)",
        boxShadow: "inset 0 1px 0 0 rgba(196,181,253,0.18)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 2,
          left: "30%",
          right: "30%",
          height: 2,
          background:
            "linear-gradient(90deg, transparent, rgba(252,211,77,0.18), transparent)",
        }}
      />
    </div>
  );
}

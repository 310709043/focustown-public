"use client";

/**
 * Six upward-drifting steam columns. Each column ramps opacity in then
 * fades while translating upward; phase offsets keep them from rising
 * in lockstep. Pure CSS so it stays cheap on the main thread.
 */
export function CafeAmbient() {
  return (
    <div
      aria-hidden
      data-testid="ambient-cafe"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            bottom: 0,
            left: `${i * 17 + 5}%`,
            width: 24,
            height: 200,
            background:
              "radial-gradient(ellipse at center bottom, rgba(245,243,255,0.15), transparent 60%)",
            animation: `cafeSteam${i % 6} 8s ease-out infinite`,
            animationDelay: `${i * 0.7}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes cafeSteam0 { 0% { opacity: 0; transform: translateY(0); } 50% { opacity: 1; } 100% { opacity: 0; transform: translateY(-40px); } }
        @keyframes cafeSteam1 { 0% { opacity: 0; transform: translateY(0); } 50% { opacity: 1; } 100% { opacity: 0; transform: translateY(-50px); } }
        @keyframes cafeSteam2 { 0% { opacity: 0; transform: translateY(0); } 50% { opacity: 1; } 100% { opacity: 0; transform: translateY(-45px); } }
        @keyframes cafeSteam3 { 0% { opacity: 0; transform: translateY(0); } 50% { opacity: 1; } 100% { opacity: 0; transform: translateY(-55px); } }
        @keyframes cafeSteam4 { 0% { opacity: 0; transform: translateY(0); } 50% { opacity: 1; } 100% { opacity: 0; transform: translateY(-42px); } }
        @keyframes cafeSteam5 { 0% { opacity: 0; transform: translateY(0); } 50% { opacity: 1; } 100% { opacity: 0; transform: translateY(-48px); } }
      `}</style>
    </div>
  );
}

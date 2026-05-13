"use client";

import { useRouter } from "next/navigation";

/**
 * The marquee CTA of the town view: a huge neon pixel-button anchored to the
 * bottom-center of the scene. Pulses constantly so the eye is drawn to it.
 *
 * Sits above buildings/NPCs (z-[7]) but below modals/overlays.
 */
export function BigFocusCTA() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push("/focus/solo")}
      className="absolute left-1/2 -translate-x-1/2 pixel-btn animate-bigPulse group"
      style={{
        bottom: 178,        /* sits above the panel row + ticker */
        width: 300,
        height: 84,
        zIndex: 7,
        background:
          "linear-gradient(135deg, rgba(124,58,237,0.85), rgba(76,29,149,0.85))",
        borderColor: "var(--a2)",
        fontSize: 14,
        letterSpacing: 3,
        overflow: "hidden",
      }}
    >
      <span
        className="relative z-[2] block font-pixel"
        style={{
          color: "#fff",
          textShadow:
            "0 0 8px var(--a2), 0 0 22px var(--a1), 0 0 38px var(--a3)",
        }}
      >
        ✦ 進入專注模式 ✦
      </span>

      {/* shimmer sweep */}
      <span
        className="pointer-events-none absolute inset-y-0 left-0 w-1/3 group-hover:animate-shimmerSweep"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(255,255,255,0.18) 50%, transparent)",
          transform: "translateX(-120%)",
        }}
      />

      {/* corner sparkles */}
      {(["top-1 left-2", "top-1 right-2", "bottom-1 left-2", "bottom-1 right-2"] as const).map(
        (pos) => (
          <span
            key={pos}
            className={`absolute ${pos} text-[8px] opacity-70 animate-twinkle`}
            style={{ color: "var(--a2)" }}
          >
            ✦
          </span>
        ),
      )}
    </button>
  );
}

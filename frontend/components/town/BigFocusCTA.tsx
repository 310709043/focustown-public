"use client";

import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/routing";

/**
 * Secondary marquee CTA — "enter focus mode". Used to sit absolute bottom-center
 * but moved to bottom-left (above TimerPanel) now that the match button owns
 * the bottom-center slot. Container is relatively positioned so the parent
 * decides placement.
 */
export function BigFocusCTA() {
  const router = useRouter();
  const t = useTranslations("focus.enter");
  return (
    <button
      onClick={() => router.push("/focus/solo")}
      className="pixel-btn animate-bigPulse group relative"
      style={{
        width: 240,
        height: 64,
        background:
          "linear-gradient(135deg, rgba(124,58,237,0.85), rgba(76,29,149,0.85))",
        borderColor: "var(--a2)",
        fontSize: 13,
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
        {t("cta")}
      </span>

      {/* shimmer sweep */}
      <span
        aria-hidden
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
            aria-hidden
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

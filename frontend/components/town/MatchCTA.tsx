"use client";

import { useTranslations } from "next-intl";

const WAITING_PLACEHOLDER_COUNT = 12;

/**
 * Bottom-center matchmaking button. Coral/pink palette (warmer than the focus
 * CTA) so the two main CTAs are visually distinct. Pulses + shimmers + sparkles
 * to read as the primary nightly action.
 */
export function MatchCTA({
  onClick,
  disabled = false,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  const t = useTranslations("match.cta");
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 z-[8] flex flex-col items-center gap-1.5
                 bottom-7 w-[calc(100%-1.5rem)] max-w-[320px] md:w-auto"
    >
      <button
        onClick={onClick}
        disabled={disabled}
        className="pixel-btn animate-bigPulse group relative w-full md:w-[320px] disabled:opacity-60 disabled:cursor-progress"
        style={{
          height: 78,
          background:
            "linear-gradient(135deg, rgba(244,114,182,0.92), rgba(251,113,133,0.92))",
          borderColor: "var(--coral)",
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
              "0 0 8px var(--pink), 0 0 22px var(--coral), 0 0 38px rgba(251,113,133,0.6)",
          }}
        >
          {t("label")}
        </span>

        {/* shimmer sweep */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-1/3 group-hover:animate-shimmerSweep"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(255,255,255,0.22) 50%, transparent)",
            transform: "translateX(-120%)",
          }}
        />

        {/* corner sparkles */}
        {(["top-1 left-2", "top-1 right-2", "bottom-1 left-2", "bottom-1 right-2"] as const).map(
          (pos) => (
            <span
              key={pos}
              aria-hidden
              className={`absolute ${pos} text-[8px] opacity-80 animate-twinkle`}
              style={{ color: "#fff" }}
            >
              ✦
            </span>
          ),
        )}
      </button>
      <div
        className="font-japan flex items-center gap-1.5"
        style={{
          fontSize: 11,
          color: "var(--coral)",
          textShadow: "0 0 6px rgba(251,113,133,0.6)",
        }}
        aria-hidden
      >
        <span
          className="inline-block animate-twinkle"
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--coral)",
            boxShadow: "0 0 8px var(--coral)",
          }}
        />
        {t("waiting", { count: WAITING_PLACEHOLDER_COUNT })}
      </div>
    </div>
  );
}

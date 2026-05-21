"use client";

import { useTranslations } from "next-intl";

import { ONBOARDING_TOTAL_STEPS } from "@/lib/state/onboardingStore";

interface CoachBubbleProps {
  /** Step eyebrow (e.g. "MODE 1 OF 3"). */
  eyebrow: string;
  /** Step title. */
  title: string;
  /** Step body copy. */
  body: string;
  /** Current step index (0-based). */
  stepIndex: number;
  /** True when on the final step — flips Next into "Got it". */
  isLast: boolean;
  /** True when on the first step — disables Back. */
  isFirst: boolean;
  /** Where on screen to anchor the bubble. */
  placement: "center" | "bottom";
  onSkip: () => void;
  onBack: () => void;
  onNext: () => void;
}

/**
 * Pixel-styled speech bubble for the onboarding tour. Renders above the
 * spotlight overlay; absorbs the click events Next / Back / Skip.
 */
export function CoachBubble({
  eyebrow,
  title,
  body,
  stepIndex,
  isLast,
  isFirst,
  placement,
  onSkip,
  onBack,
  onNext,
}: CoachBubbleProps) {
  const t = useTranslations("onboarding.controls");

  const positionStyle: React.CSSProperties =
    placement === "center"
      ? {
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }
      : {
          // Sit above the BottomHUD (168 px) + ModeStatusBar (36 px) +
          // small breathing gap so the dashed ring around the target
          // remains visible.
          bottom: 230,
          left: "50%",
          transform: "translateX(-50%)",
        };

  return (
    <div
      data-testid="onboarding-bubble"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-bubble-title"
      className="pixel-panel"
      style={{
        position: "fixed",
        zIndex: 62,
        width: "min(440px, 92vw)",
        padding: "18px 20px",
        background: "rgba(12, 5, 35, 0.96)",
        boxShadow:
          "0 0 0 1px var(--panel-stroke-strong), 0 18px 48px rgba(0,0,0,0.55), 0 0 32px rgba(167,139,250,0.18)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        ...positionStyle,
      }}
    >
      <div
        className="font-silkscreen"
        style={{
          fontSize: 9,
          letterSpacing: "0.35em",
          color: "var(--accent-2)",
          textShadow: "0 0 8px var(--accent-2)",
        }}
      >
        {eyebrow}
      </div>

      <h2
        id="onboarding-bubble-title"
        className="font-silkscreen"
        style={{
          margin: 0,
          fontSize: 18,
          color: "var(--accent)",
          letterSpacing: "0.06em",
          lineHeight: 1.2,
          textShadow: "var(--neon-glow)",
        }}
      >
        {title}
      </h2>

      <p
        className="font-silkscreen"
        style={{
          margin: 0,
          fontSize: 11,
          color: "var(--ink-mute)",
          letterSpacing: "0.04em",
          lineHeight: 1.6,
        }}
      >
        {body}
      </p>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 6,
          gap: 8,
        }}
      >
        <button
          type="button"
          data-testid="onboarding-skip"
          onClick={onSkip}
          className="font-silkscreen"
          style={{
            background: "transparent",
            border: "1px solid var(--panel-stroke)",
            color: "var(--ink-dim)",
            fontSize: 10,
            letterSpacing: "0.22em",
            padding: "6px 12px",
            cursor: "pointer",
          }}
        >
          {t("skip")}
        </button>

        <div
          className="font-silkscreen"
          style={{
            fontSize: 9,
            color: "var(--ink-dim)",
            letterSpacing: "0.22em",
          }}
        >
          {t("stepIndicator", {
            current: stepIndex + 1,
            total: ONBOARDING_TOTAL_STEPS,
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            type="button"
            data-testid="onboarding-back"
            onClick={onBack}
            disabled={isFirst}
            className="font-silkscreen"
            style={{
              background: "transparent",
              border: "1px solid var(--accent-3)",
              color: "var(--accent-3)",
              fontSize: 10,
              letterSpacing: "0.18em",
              padding: "6px 10px",
              cursor: isFirst ? "not-allowed" : "pointer",
              opacity: isFirst ? 0.4 : 1,
            }}
          >
            {t("back")}
          </button>
          <button
            type="button"
            data-testid="onboarding-next"
            onClick={onNext}
            className="pixel-btn primary"
            style={{
              fontSize: 11,
              padding: "8px 14px",
              letterSpacing: "0.22em",
            }}
          >
            {isLast ? t("done") : t("next")}
          </button>
        </div>
      </div>
    </div>
  );
}

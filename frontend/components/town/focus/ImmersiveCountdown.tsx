"use client";

import { useTranslations } from "next-intl";

import { PixelDigits } from "@/components/pixel/PixelDigits";
import { useImmersiveFocus } from "@/lib/hooks/useImmersiveFocus";
import { usePrefersReducedMotion } from "@/lib/hooks/usePrefersReducedMotion";
import { useTimerStore } from "@/lib/state/timerStore";

/**
 * Top-centre countdown shown while City Mode is in immersive focus.
 *
 * Mounts always; visibility is driven by `useImmersiveFocus()` so the
 * fade-in / fade-out is a pure CSS transition (no remount, no layout
 * thrash). Sits in the existing TownTopHUD strip between LOGO+WEATHER
 * (top-left) and CLOCK (top-right) — the user's chosen placement,
 * keeping the city skyline unobstructed.
 *
 * Composes the same `PixelDigits` glyph font the BottomHUD timer uses;
 * `scale={5}` lands roughly between BottomHUD's 4 and BigTimer's 8 so
 * the countdown reads as a centrepiece without dominating the sky.
 */
export function ImmersiveCountdown() {
  const t = useTranslations("town.bottom.immersive");
  const visible = useImmersiveFocus();
  const reduceMotion = usePrefersReducedMotion();

  const mode = useTimerStore((s) => s.mode);
  const remaining = useTimerStore((s) => s.remaining);
  const durationSeconds = useTimerStore((s) => s.durationSeconds);
  const tomatoCount = useTimerStore((s) => s.tomatoCount);
  const pause = useTimerStore((s) => s.pause);

  const total = Math.max(1, durationSeconds);
  const pct = (1 - remaining / total) * 100;
  const mins = String(Math.floor(remaining / 60)).padStart(2, "0");
  const secs = String(remaining % 60).padStart(2, "0");

  const modeLabel =
    mode === "focus" ? t("modeLabel") : t("modeLabelBreak");
  const suffix =
    mode === "focus" ? t("pomodoroSuffix", { num: tomatoCount + 1 }) : "";

  return (
    <div
      data-testid="immersive-countdown"
      aria-hidden={!visible}
      style={{
        position: "absolute",
        top: 14,
        left: "50%",
        transform: `translateX(-50%) translateY(${visible ? "0" : "-12px"}) scale(${visible ? "1" : "0.92"})`,
        opacity: visible ? 1 : 0,
        transition: reduceMotion
          ? "none"
          : "opacity 450ms cubic-bezier(0.22,1,0.36,1), transform 450ms cubic-bezier(0.22,1,0.36,1)",
        // Wait for the ground stack to finish extending (1100 ms slow ease)
        // before the countdown takes the stage. Exit fires immediately so
        // pause / end snaps the world back without lag.
        transitionDelay: reduceMotion ? "0ms" : visible ? "1100ms" : "0ms",
        pointerEvents: visible ? "auto" : "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        zIndex: 14,
        // Tight container — the timer is the centrepiece, not the panel.
        padding: "6px 12px 8px",
      }}
    >
      <span
        className="font-silkscreen"
        style={{
          fontSize: 9,
          color: "var(--accent)",
          letterSpacing: "0.32em",
          textShadow: "0 0 8px var(--accent)",
          whiteSpace: "nowrap",
        }}
      >
        {modeLabel}
        {suffix ? (
          <>
            <span style={{ color: "var(--ink-dim)", margin: "0 6px" }}>·</span>
            <span style={{ color: "var(--accent-2)" }}>{suffix}</span>
          </>
        ) : null}
      </span>

      <PixelDigits
        text={`${mins}:${secs}`}
        scale={5}
        color="var(--ink)"
        glow="var(--accent)"
      />

      <div
        aria-hidden
        style={{
          width: 168,
          height: 2,
          background: "rgba(0,0,0,0.5)",
          border: "1px solid var(--panel-stroke)",
          marginTop: 2,
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: "var(--accent)",
            boxShadow: "var(--neon-glow)",
            transition: "width 0.3s linear",
          }}
        />
      </div>

      <button
        type="button"
        data-testid="immersive-pause"
        aria-label={t("pauseAria")}
        onClick={() => pause()}
        className="font-silkscreen"
        style={{
          marginTop: 4,
          padding: "4px 10px",
          background: "transparent",
          border: "none",
          color: "var(--ink-mute)",
          fontSize: 10,
          letterSpacing: "0.24em",
          cursor: "pointer",
          opacity: visible ? 0.75 : 0,
          transition: reduceMotion
            ? "none"
            : "opacity 250ms ease-out, color 150ms ease-out",
          // Pause CTA appears just after the countdown lands (1100 ms ground
          // extension + 450 ms countdown fade ≈ 1550 ms — settle and offer).
          transitionDelay: reduceMotion ? "0ms" : visible ? "1550ms" : "0ms",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--accent-2)";
          e.currentTarget.style.opacity = "1";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--ink-mute)";
          e.currentTarget.style.opacity = "0.75";
        }}
      >
        {t("pauseCta")}
      </button>
    </div>
  );
}

"use client";

import { useTranslations } from "next-intl";

import { PixelCat } from "@/components/focus/PixelCat";
import { useCatMood } from "@/lib/hooks/useCatMood";
import type { CatMood } from "@/lib/hooks/useCatMood";
import { useFaceDirection } from "@/lib/hooks/useFaceDirection";

const SMALL_SIZE = 80;
const BIG_SIZE = 200;

const MOOD_ANIM_CLASS: Record<CatMood, string> = {
  idle: "",
  watching: "",
  happy: "",
  suspicious: "cat-tilt",
  angry: "cat-shake",
  sleeping: "cat-sleep",
};

const MOOD_DOT: Record<CatMood, string> = {
  idle: "var(--ink-mute)",
  watching: "var(--accent-2)",
  happy: "var(--accent)",
  suspicious: "#facc15",
  angry: "#f87171",
  sleeping: "var(--ink-dim)",
};

function overlayGlow(nudgeCount: number): string {
  if (nudgeCount >= 3) return "rgba(248,113,113,0.5)";
  if (nudgeCount >= 2) return "rgba(250,204,21,0.4)";
  return "rgba(168,85,247,0.3)";
}

function SpeechBubble({ text, size = "small" }: { text: string; size?: "small" | "large" }) {
  const isLarge = size === "large";
  return (
    <div
      className="cat-speech-bubble font-silkscreen"
      style={{
        position: isLarge ? "relative" : "absolute",
        top: isLarge ? undefined : -8,
        left: isLarge ? undefined : "50%",
        transform: isLarge ? undefined : "translateX(-50%) translateY(-100%)",
        background: "rgba(255,255,255,0.95)",
        color: "#1a1a2e",
        padding: isLarge ? "8px 16px" : "5px 10px",
        borderRadius: isLarge ? 8 : 6,
        fontSize: isLarge ? 16 : 10,
        whiteSpace: "nowrap",
        pointerEvents: "none",
        zIndex: 10,
        boxShadow: isLarge ? "0 4px 16px rgba(0,0,0,0.35)" : "0 2px 8px rgba(0,0,0,0.25)",
        letterSpacing: isLarge ? "0.08em" : "0.05em",
        marginBottom: isLarge ? 12 : undefined,
      }}
    >
      {text}
      <div
        style={{
          position: "absolute",
          bottom: isLarge ? -6 : -5,
          left: "50%",
          transform: "translateX(-50%)",
          width: 0,
          height: 0,
          borderLeft: `${isLarge ? 8 : 6}px solid transparent`,
          borderRight: `${isLarge ? 8 : 6}px solid transparent`,
          borderTop: `${isLarge ? 8 : 6}px solid rgba(255,255,255,0.95)`,
        }}
      />
    </div>
  );
}

/**
 * Supervision cat.
 *
 * Distraction trigger: window loses focus / tab hidden (user switched away).
 * Presence detection:  MediaPipe face detection — sleeping when no face 20s.
 *
 * Mood ladder (while window is hidden):
 *   watching → suspicious (5s, panel) → angry (12s, big overlay + meow)
 * Return to focus → auto-dismiss overlay + welcome back bubble.
 */
export function CatSupervisor() {
  const t = useTranslations("focus.catSupervisor");
  const { camState, faceDetected, videoRef, enable, disable } = useFaceDirection();
  const { mood, isSupervising, speechKey, focusStreak, nudgeCount, dismiss } =
    useCatMood(faceDetected, camState);

  const isActive = camState === "active";
  const isBusy = camState === "requesting" || camState === "loading";

  const statusText: Record<string, string> = {
    idle: t("statusIdle"),
    requesting: t("statusRequesting"),
    loading: t("statusLoading"),
    active: t("statusActive"),
    denied: t("statusDenied"),
    unsupported: t("statusUnsupported"),
  };

  const bubbleText = speechKey ? t(speechKey) : null;

  return (
    <>
      {/* ---- Panel in right rail ---- */}
      <div
        data-testid="cat-supervisor"
        className="pixel-panel"
        style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span
            className="font-silkscreen"
            style={{ fontSize: 9, color: "var(--accent-2)", letterSpacing: "0.2em" }}
          >
            {t("title")}
          </span>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: isActive ? MOOD_DOT[mood] : "var(--ink-mute)",
                boxShadow: mood === "happy" ? "0 0 5px var(--accent)" : "none",
                transition: "background 0.3s",
              }}
            />
            <span className="font-silkscreen" style={{ fontSize: 8, color: "var(--ink-mute)" }}>
              {statusText[camState] ?? ""}
            </span>
          </div>
        </div>

        {/* Cat */}
        <div
          style={{
            position: "relative",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: SMALL_SIZE,
            opacity: isSupervising ? 0.15 : isActive ? 1 : 0.4,
            transition: "opacity 0.4s ease",
          }}
        >
          {bubbleText && !isSupervising && <SpeechBubble text={bubbleText} />}
          <div className={isActive && !isSupervising ? MOOD_ANIM_CLASS[mood] : ""}>
            <PixelCat mood={isActive ? mood : "idle"} size={SMALL_SIZE} />
          </div>
        </div>

        {/* Focus streak bar */}
        {isActive && focusStreak > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
            <div
              style={{
                flex: 1,
                height: 3,
                background: "rgba(255,255,255,0.08)",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.min((focusStreak / 300) * 100, 100)}%`,
                  background: "linear-gradient(90deg, var(--accent-2), var(--accent))",
                  borderRadius: 2,
                  transition: "width 1s linear",
                }}
              />
            </div>
            <span className="font-silkscreen" style={{ fontSize: 7, color: "var(--ink-dim)" }}>
              {Math.floor(focusStreak / 60)}:{String(focusStreak % 60).padStart(2, "0")}
            </span>
          </div>
        )}

        {/* Nudge count */}
        {nudgeCount > 0 && (
          <div
            className="font-silkscreen"
            style={{
              fontSize: 7,
              color: nudgeCount >= 3 ? "#f87171" : "var(--ink-dim)",
              textAlign: "center",
              letterSpacing: "0.1em",
            }}
          >
            {t("nudgeCount", { count: nudgeCount })}
          </div>
        )}

        {/* Controls */}
        <div style={{ display: "flex", gap: 6 }}>
          {isActive ? (
            <button
              type="button"
              data-testid="cat-supervisor-disable"
              className="pixel-btn"
              aria-label={t("disableAria")}
              style={{ flex: 1, padding: "4px 8px", fontSize: 9, letterSpacing: "0.18em" }}
              onClick={disable}
            >
              {t("disableCta")}
            </button>
          ) : (
            <button
              type="button"
              data-testid="cat-supervisor-enable"
              className="pixel-btn primary"
              aria-label={t("enableAria")}
              disabled={isBusy}
              style={{
                flex: 1,
                padding: "4px 8px",
                fontSize: 9,
                letterSpacing: "0.18em",
                opacity: isBusy ? 0.6 : 1,
              }}
              onClick={() => void enable()}
            >
              {isBusy ? "..." : t("enableCta")}
            </button>
          )}
        </div>

        {/* Privacy */}
        <div
          className="font-silkscreen"
          style={{ fontSize: 7, color: "var(--ink-dim)", letterSpacing: "0.08em", textAlign: "center" }}
        >
          {t("privacy")}
        </div>

        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          aria-hidden
          playsInline
          muted
          style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
        />
      </div>

      {/* ---- Big overlay when supervising ---- */}
      {isSupervising && (
        <div
          data-testid="cat-supervisor-overlay"
          className="cat-overlay-enter"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "radial-gradient(ellipse, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.78) 100%)",
            cursor: "pointer",
            boxShadow: `inset 0 0 120px ${overlayGlow(nudgeCount)}`,
          }}
          onClick={dismiss}
          onKeyDown={(e) => { if (e.key === "Escape" || e.key === "Enter") dismiss(); }}
          role="button"
          tabIndex={0}
          aria-label={t("dismissAria")}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            {bubbleText && <SpeechBubble text={bubbleText} size="large" />}
            <div className={`cat-pop-in ${MOOD_ANIM_CLASS[mood]}`}>
              <PixelCat mood={mood} size={BIG_SIZE} />
            </div>
            <span
              className="font-silkscreen"
              style={{ marginTop: 14, fontSize: 10, color: "rgba(255,255,255,0.45)", letterSpacing: "0.15em" }}
            >
              {t("clickToDismiss")}
            </span>
          </div>
        </div>
      )}
    </>
  );
}

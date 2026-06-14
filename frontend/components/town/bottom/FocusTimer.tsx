"use client";

import { useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";

import { PixelDigits } from "@/components/pixel/PixelDigits";
import { useTimer } from "@/lib/hooks/useTimer";
import {
  PREF_FOCUS_DURATION_MINUTES,
  usePreferencesStore,
} from "@/lib/state/preferencesStore";
import { useTimerStore } from "@/lib/state/timerStore";
import { useSceneStore } from "@/lib/state/sceneStore";

/** Lower bound — settings UI clamps to 5 min already but we re-clamp here
 *  in case the stored value is stale or hand-edited. */
const MIN_FOCUS_SECONDS = 5 * 60;

const SCENE_EMOJI: Record<string, string> = {
  night: "🌙",
  midnight: "🌑",
  dawn: "🌅",
  day: "☀",
  cloudy: "☁",
  dusk: "🌆",
  rain: "☂",
  snow: "❄",
  storm: "⚡",
};

export function FocusTimer() {
  useTimer();
  const t = useTranslations("town.bottom.focusTimer");
  const {
    mode,
    remaining,
    durationSeconds,
    running,
    starting,
    tomatoCount,
    session,
    completionError,
    start,
    pause,
    reset,
    setMode,
    retryComplete,
  } = useTimerStore();
  const scene = useSceneStore((s) => s.current);
  const advanceScene = useSceneStore((s) => s.advance);

  const prefsHydrated = usePreferencesStore((s) => s.hydrated);
  const ensurePrefsHydrated = usePreferencesStore((s) => s.ensureHydrated);
  const prefFocusMinutes = usePreferencesStore((s) =>
    Number(s.byKey[PREF_FOCUS_DURATION_MINUTES] ?? 25),
  );
  const prefFocusSeconds = Math.max(
    MIN_FOCUS_SECONDS,
    Math.round(prefFocusMinutes * 60),
  );

  useEffect(() => {
    void ensurePrefsHydrated();
  }, [ensurePrefsHydrated]);

  useEffect(() => {
    if (!prefsHydrated) return;
    if (mode !== "focus") return;
    if (running || session) return;
    if (durationSeconds === prefFocusSeconds) return;
    setMode("focus", prefFocusSeconds);
  }, [
    prefsHydrated,
    prefFocusSeconds,
    mode,
    running,
    session,
    durationSeconds,
    setMode,
  ]);

  const applyPreference = useCallback(() => {
    setMode("focus", prefFocusSeconds);
  }, [setMode, prefFocusSeconds]);

  const canApplyPreference =
    prefsHydrated && !running && !starting && !session;

  const total = Math.max(1, durationSeconds);
  const pct = (1 - remaining / total) * 100;
  const mins = String(Math.floor(remaining / 60)).padStart(2, "0");
  const secs = String(remaining % 60).padStart(2, "0");

  return (
    <div
      data-testid="focus-timer-bottom"
      className="pixel-panel hud-panel"
    >
      {/* Header row */}
      <div className="hud-panel-header">
        <div
          className="font-silkscreen"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            color: "var(--accent)",
            letterSpacing: "0.18em",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center" }}>
            <span style={{ width: 14, height: 8, border: "1px solid var(--accent)", background: "rgba(74,222,128,0.3)", display: "inline-block", boxSizing: "border-box" }} />
            <span style={{ width: 2, height: 4, background: "var(--accent)", display: "inline-block" }} />
          </span>
          <span>
            {mode === "focus"
              ? t("modeFocus", { num: tomatoCount + 1 })
              : t("modeBreak")}
          </span>
        </div>
        <span
          className="font-silkscreen"
          style={{ fontSize: 10, color: "var(--ink-mute)" }}
        >
          {t("progressLabel", { count: tomatoCount, total: 8 })}
        </span>
      </div>

      {/* Timer digits */}
      <div style={{ display: "flex", justifyContent: "center", padding: "6px 0" }}>
        <PixelDigits
          text={`${mins}:${secs}`}
          scale={4}
          color="var(--ink)"
          glow="var(--accent)"
        />
      </div>

      {/* Progress bar */}
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t("startAria")}
        style={{
          height: 6,
          background: "rgba(0,0,0,0.5)",
          border: "1px solid var(--panel-stroke)",
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

      {completionError ? (
        <button
          type="button"
          className="font-silkscreen"
          style={{
            fontSize: 10,
            color: "#fca5a5",
            background: "rgba(220,38,38,0.15)",
            border: "1px solid rgba(248,113,113,0.4)",
            padding: "6px 10px",
            cursor: "pointer",
            textAlign: "center",
            width: "100%",
          }}
          onClick={() => void retryComplete()}
        >
          {t("completionFailed")}
        </button>
      ) : null}

      {/* Controls */}
      <div className="hud-panel-controls">
        <button
          type="button"
          aria-label={t("resetAria")}
          data-testid="bottom-timer-reset"
          className="pixel-btn touch:min-h-[44px]"
          style={{ padding: "6px 10px", fontSize: 12 }}
          onClick={() => reset()}
        >
          ↺
        </button>
        <button
          type="button"
          aria-label={running ? t("pauseAria") : t("startAria")}
          data-testid="bottom-timer-toggle"
          className="pixel-btn primary touch:min-h-[44px]"
          style={{ padding: "6px 16px", fontSize: 11, minWidth: 80, flex: 1 }}
          disabled={starting}
          onClick={() => (running ? pause() : void start())}
        >
          {starting ? "…" : running ? `⏸ ${t("pauseCta")}` : `▶ ${t("startCta")}`}
        </button>
        <button
          type="button"
          aria-label={t("sceneAria")}
          data-testid="bottom-timer-scene"
          className="pixel-btn touch:min-h-[44px]"
          style={{ padding: "6px 10px", fontSize: 13 }}
          onClick={() => advanceScene()}
        >
          {SCENE_EMOJI[scene] ?? "☀"}
        </button>
      </div>
    </div>
  );
}

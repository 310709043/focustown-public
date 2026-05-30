"use client";

import { useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";

import { PixelDigits } from "@/components/pixel/PixelDigits";
import { PixelSprite } from "@/components/pixel/PixelSprite";
import { BATTERY } from "@/lib/pixel/sprites/props";
import { useTimer } from "@/lib/hooks/useTimer";
import {
  PREF_FOCUS_DURATION_MINUTES,
  usePreferencesStore,
} from "@/lib/state/preferencesStore";
import { useTimerStore } from "@/lib/state/timerStore";
import { useSceneStore } from "@/lib/state/sceneStore";

import { TomatoStrip } from "./TomatoStrip";

/** Lower bound — settings UI clamps to 5 min already but we re-clamp here
 *  in case the stored value is stale or hand-edited. */
const MIN_FOCUS_SECONDS = 5 * 60;

const SCENE_EMOJI: Record<string, string> = {
  night: "🌙",
  dawn: "🌅",
  day: "☀",
  dusk: "🌆",
  rain: "☂",
  snow: "❄",
  storm: "⚡",
};

/**
 * Bottom-HUD FocusTimer variant — compact (vs Page 4 BigTimer's huge
 * solo-room scale). Header (TOMATO sprite + mode + tomato counter),
 * PixelDigits scale 4 countdown, 8 px progress bar, and a 5-button
 * row: reset / play-pause primary / skip + scene-cycle buttons.
 *
 * Wires:
 *   useTimerStore + useTimer — start / pause / reset / tick state
 *   useSceneStore.advance — clicking either scene-cycle button cycles
 *                            through the global scene order
 *
 * SRP — this component does only "timer + scene cycle". MatchPanel and
 * MusicPlayer live in their own files.
 */
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
    start,
    pause,
    reset,
    setMode,
  } = useTimerStore();
  const scene = useSceneStore((s) => s.current);
  const advanceScene = useSceneStore((s) => s.advance);

  // Preference-driven focus rhythm — pull the user's stored focus
  // duration so the timer reflects their settings instead of the
  // hardcoded 25 min default. Subscriptions stay separate so unrelated
  // preference patches don't churn the timer's render.
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

  // Auto-apply the stored focus rhythm whenever the timer is idle in
  // focus mode and the current duration doesn't match the preference.
  // Avoids interrupting an in-flight session or a break.
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

  // Re-applying preferences while the timer is running would mid-cycle
  // jump the countdown; gate the manual button on idle state.
  const canApplyPreference =
    prefsHydrated && !running && !starting && !session;

  const total = Math.max(1, durationSeconds);
  const pct = (1 - remaining / total) * 100;
  const mins = String(Math.floor(remaining / 60)).padStart(2, "0");
  const secs = String(remaining % 60).padStart(2, "0");

  return (
    <div
      data-testid="focus-timer-bottom"
      className="pixel-panel"
      style={{ padding: 12, display: "flex", flexDirection: "column", gap: 6 }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div
          className="font-silkscreen"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 10,
            color: "var(--accent)",
            letterSpacing: "0.2em",
          }}
        >
          <PixelSprite sprite={BATTERY.sprite} palette={BATTERY.palette} scale={1.4} />
          <span>
            {mode === "focus"
              ? t("modeFocus", { num: tomatoCount + 1 })
              : t("modeBreak")}
          </span>
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <button
            type="button"
            data-testid="focus-timer-apply-preference"
            onClick={applyPreference}
            disabled={!canApplyPreference}
            aria-label={t("applyPreferenceAria")}
            title={t("applyPreferenceTooltip", { minutes: prefFocusMinutes })}
            className="font-silkscreen disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              padding: "2px 8px",
              fontSize: 9,
              letterSpacing: "0.2em",
              color: "var(--accent-2)",
              background: "rgba(20,10,55,0.55)",
              border: "1px solid var(--panel-stroke)",
              cursor: "pointer",
            }}
          >
            {t("applyPreferenceCta")}
          </button>
          <span
            className="font-silkscreen"
            style={{ fontSize: 9, color: "var(--ink-mute)" }}
          >
            {t("progressLabel", { count: tomatoCount, total: 8 })}
          </span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "4px 0",
        }}
      >
        <PixelDigits
          text={`${mins}:${secs}`}
          scale={4}
          color="var(--ink)"
          glow="var(--accent)"
        />
      </div>

      <div
        style={{
          height: 8,
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

      <div style={{ display: "flex", gap: 6, justifyContent: "center", alignItems: "center" }}>
        <button
          type="button"
          aria-label={t("resetAria")}
          data-testid="bottom-timer-reset"
          className="pixel-btn"
          style={{ padding: "5px 8px", fontSize: 11 }}
          onClick={() => reset()}
        >
          ↺
        </button>
        <button
          type="button"
          aria-label={running ? t("pauseAria") : t("startAria")}
          data-testid="bottom-timer-toggle"
          className="pixel-btn primary"
          style={{ padding: "5px 14px", fontSize: 11, minWidth: 78 }}
          disabled={starting}
          onClick={() => (running ? pause() : void start())}
        >
          {starting ? "…" : running ? `⏸ ${t("pauseCta")}` : `▶ ${t("startCta")}`}
        </button>
        {/* Skip / ⏭ button removed in goal-set round — let users cheese
            their pomodoro streak with a tap was bad UX. Translation
            keys `skipAria` / `skipCta` stay in JSON until the matching
            BigTimer skip is also retired. */}
        <span
          aria-hidden
          style={{
            width: 1,
            height: 18,
            background: "var(--panel-stroke)",
            margin: "0 2px",
          }}
        />
        <button
          type="button"
          aria-label={t("sceneAria")}
          data-testid="bottom-timer-scene"
          className="pixel-btn"
          style={{ padding: "4px 6px", fontSize: 12 }}
          onClick={() => advanceScene()}
        >
          {SCENE_EMOJI[scene] ?? "☀"}
        </button>
      </div>
    </div>
  );
}

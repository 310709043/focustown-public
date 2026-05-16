"use client";

import { useTranslations } from "next-intl";

import { PixelDigits } from "@/components/pixel/PixelDigits";
import { PixelSprite } from "@/components/pixel/PixelSprite";
import { TOMATO } from "@/lib/pixel/sprites/props";
import { useTimer } from "@/lib/hooks/useTimer";
import { useTimerStore } from "@/lib/state/timerStore";
import { useSceneStore } from "@/lib/state/sceneStore";

import { TomatoStrip } from "./TomatoStrip";

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
    start,
    pause,
    reset,
  } = useTimerStore();
  const scene = useSceneStore((s) => s.current);
  const advanceScene = useSceneStore((s) => s.advance);

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
          <PixelSprite sprite={TOMATO.sprite} palette={TOMATO.palette} scale={1.4} />
          <span>
            {mode === "focus"
              ? t("modeFocus", { num: tomatoCount + 1 })
              : t("modeBreak")}
          </span>
        </div>
        <span
          className="font-silkscreen"
          style={{ fontSize: 9, color: "var(--ink-mute)" }}
        >
          {t("progressLabel", { count: tomatoCount, total: 8 })}
        </span>
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
        <button
          type="button"
          aria-label={t("skipAria")}
          data-testid="bottom-timer-skip"
          className="pixel-btn"
          style={{ padding: "5px 8px", fontSize: 11 }}
          onClick={() => useTimerStore.setState({ remaining: 0 })}
        >
          ⏭
        </button>
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

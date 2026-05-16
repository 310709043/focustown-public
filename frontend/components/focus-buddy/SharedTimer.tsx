"use client";

import { useTranslations } from "next-intl";

import { PixelDigits } from "@/components/pixel/PixelDigits";
import { TomatoStrip } from "@/components/town/bottom/TomatoStrip";
import { useTimer } from "@/lib/hooks/useTimer";
import { useTimerStore } from "@/lib/state/timerStore";

interface SharedTimerProps {
  /** Match id forwarded to `useTimerStore.start()` as `partnerId`. */
  matchId: string;
}

/**
 * Buddy-room shared timer. Visually distinct from Page 4 BigTimer:
 *  - Larger `PixelDigits` (scale 7) glowing **accent-2 pink**
 *    (vs solo room's accent purple), to signal "shared session".
 *  - 10 px progress bar with `linear-gradient(90deg, var(--accent), var(--accent-2))`
 *    fill + `var(--neon-glow-pink)` — gradient bar = "two users contributing".
 *  - Reuses `<TomatoStrip>` from Phase C1 (scale 1.3 to match reference).
 *
 * Cooperation hint at the bottom is the reference's plain text rendered
 * via i18n: 兩人都按下開始才會計時 · 中途離開 -10 T 幣
 *
 * Reference: screen-buddy.jsx:L91-L118.
 */
export function SharedTimer({ matchId }: SharedTimerProps) {
  useTimer();
  const t = useTranslations("focus.buddy.sharedTimer");
  const { mode, remaining, durationSeconds, running, tomatoCount, start, pause, reset } =
    useTimerStore();

  const total = Math.max(1, durationSeconds);
  const pct = (1 - remaining / total) * 100;
  const mins = String(Math.floor(remaining / 60)).padStart(2, "0");
  const secs = String(remaining % 60).padStart(2, "0");

  return (
    <div
      data-testid="shared-timer"
      className="pixel-panel"
      style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          className="font-silkscreen"
          style={{
            fontSize: 11,
            color: "var(--accent)",
            letterSpacing: "0.25em",
          }}
        >
          ● {mode === "focus" ? t("headerFocus", { num: tomatoCount + 1 }) : t("headerBreak")}
        </span>
        <TomatoStrip count={tomatoCount} max={8} scale={1.3} gap={3} />
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
          scale={7}
          color="var(--ink)"
          glow="var(--accent-2)"
        />
      </div>

      <div
        style={{
          height: 10,
          background: "rgba(0,0,0,0.5)",
          border: "1px solid var(--panel-stroke)",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: "linear-gradient(90deg, var(--accent), var(--accent-2))",
            boxShadow: "var(--neon-glow-pink)",
            transition: "width 0.3s linear",
          }}
        />
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <button
          type="button"
          data-testid="shared-timer-reset"
          aria-label={t("resetAria")}
          className="pixel-btn"
          style={{ padding: "6px 12px", fontSize: 11 }}
          onClick={() => reset()}
        >
          ↺ {t("resetCta")}
        </button>
        <button
          type="button"
          data-testid="shared-timer-toggle"
          aria-label={running ? t("pauseAria") : t("startAria")}
          className="pixel-btn primary"
          style={{ padding: "8px 24px", fontSize: 12 }}
          onClick={() => (running ? pause() : void start(undefined, matchId))}
        >
          {running ? `⏸ ${t("pauseCta")}` : `▶ ${t("startCta")}`}
        </button>
        <button
          type="button"
          data-testid="shared-timer-skip"
          aria-label={t("skipAria")}
          className="pixel-btn"
          style={{ padding: "6px 12px", fontSize: 11 }}
          onClick={() => useTimerStore.setState({ remaining: 0 })}
        >
          {t("skipCta")} ⏭
        </button>
      </div>

      <div
        className="font-silkscreen"
        style={{
          fontSize: 9,
          color: "var(--ink-dim)",
          textAlign: "center",
          letterSpacing: "0.2em",
        }}
      >
        {t("cooperationHint")}
      </div>
    </div>
  );
}

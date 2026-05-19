"use client";

import { useTranslations } from "next-intl";

import {
  FOCUS_BG_OPTIONS,
} from "@/lib/data/focusBackgrounds";
import { useAmbientStore } from "@/lib/state/ambientStore";

const TIMELINE_OFFSETS = [0, 1, 2, 3] as const;

/**
 * Reference's "next environment" preview card. Reads cycle state from
 * `ambientStore` — no own rAF loop. The 4-cell timeline shows the next
 * three upcoming scenes after the current one.
 */
export function NextEnvCard() {
  const t = useTranslations("focus.solo.nextEnv");
  const tLabel = useTranslations("focus.solo.ambient.labels");
  const fromIdx = useAmbientStore((s) => s.fromIdx);
  const progress = useAmbientStore((s) => s.t);
  const isFading = useAmbientStore((s) => s.isFading);

  const safeFromIdx = Number.isFinite(fromIdx) ? fromIdx : 0;
  const next =
    FOCUS_BG_OPTIONS[(safeFromIdx + 1) % FOCUS_BG_OPTIONS.length] ??
    FOCUS_BG_OPTIONS[0];
  const pct = Math.round(progress * 100);

  return (
    <div
      data-testid="next-env-card"
      className="pixel-panel"
      style={{
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        className="font-silkscreen"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 10,
          color: "var(--accent-3)",
          letterSpacing: "0.2em",
        }}
      >
        <span>● {t("header")}</span>
        <span style={{ color: "var(--ink-dim)", fontSize: 9 }}>
          {t("autoTuned")}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          data-next-env-emoji={next.id}
          style={{ fontSize: 22 }}
        >
          {next.emoji}
        </div>
        <div style={{ flex: 1 }}>
          <div
            className="font-silkscreen"
            style={{ fontSize: 12, color: "var(--ink)" }}
          >
            {tLabel(next.labelKey)}
          </div>
          <div
            className="font-silkscreen"
            style={{
              fontSize: 9,
              color: "var(--ink-dim)",
              letterSpacing: "0.15em",
            }}
          >
            {isFading ? t("switching", { pct }) : t("inAbout")}
          </div>
        </div>
      </div>

      <div
        data-testid="next-env-timeline"
        style={{ display: "flex", gap: 4 }}
      >
        {TIMELINE_OFFSETS.map((k) => {
          const e =
            FOCUS_BG_OPTIONS[(safeFromIdx + k) % FOCUS_BG_OPTIONS.length] ??
            FOCUS_BG_OPTIONS[0];
          const isCurrent = k === 0;
          return (
            <div
              key={k}
              data-timeline-slot={k}
              data-current={isCurrent ? "true" : "false"}
              style={{
                flex: 1,
                padding: "4px 2px",
                textAlign: "center",
                background: isCurrent
                  ? "rgba(34,211,238,0.15)"
                  : "rgba(0,0,0,0.3)",
                border: `1px solid ${
                  isCurrent ? "var(--accent-3)" : "var(--panel-stroke)"
                }`,
                fontSize: 13,
              }}
            >
              {e.emoji}
            </div>
          );
        })}
      </div>
    </div>
  );
}

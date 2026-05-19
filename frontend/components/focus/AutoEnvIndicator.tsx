"use client";

import { useTranslations } from "next-intl";

import {
  FOCUS_BG_OPTIONS,
} from "@/lib/data/focusBackgrounds";
import { useAmbientStore } from "@/lib/state/ambientStore";

/**
 * Top-bar pill that reflects the auto-cycling ambient state. Mirrors
 * reference/screen-focus.jsx:111-128 — emoji + AUTO + current label,
 * plus a "fading from …" hint while a crossfade is active.
 */
export function AutoEnvIndicator() {
  const t = useTranslations("focus.solo.topBar");
  const tLabel = useTranslations("focus.solo.ambient.labels");
  const fromIdx = useAmbientStore((s) => s.fromIdx);
  const toIdx = useAmbientStore((s) => s.toIdx);
  const isFading = useAmbientStore((s) => s.isFading);

  // Defensive: a transient out-of-bounds idx (HMR / persist mismatch)
  // must not throw and bring the parent scene down via the error boundary.
  const current = FOCUS_BG_OPTIONS[toIdx] ?? FOCUS_BG_OPTIONS[0];
  const from = FOCUS_BG_OPTIONS[fromIdx] ?? FOCUS_BG_OPTIONS[0];

  return (
    <div
      data-testid="solo-env-indicator"
      data-env={current.id}
      style={{
        padding: "4px 10px",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: "rgba(7,4,26,0.7)",
        border: "1px solid var(--panel-stroke)",
        fontFamily: 'var(--font-silkscreen), "Noto Sans TC", monospace',
        fontSize: 10,
        color: "var(--ink-mute)",
        letterSpacing: "0.15em",
      }}
    >
      <span style={{ fontSize: 13 }}>{current.emoji}</span>
      <span style={{ color: "var(--accent-3)" }}>{t("autoLabel")}</span>
      <span style={{ color: "var(--ink-dim)" }}>·</span>
      <span style={{ color: "var(--ink)" }}>
        {tLabel(current.labelKey)}
      </span>
      {isFading && (
        <>
          <span style={{ color: "var(--ink-dim)" }}>·</span>
          <span style={{ color: "var(--accent-2)" }}>
            {t("fadingFrom", { label: tLabel(from.labelKey) })}
          </span>
        </>
      )}
    </div>
  );
}

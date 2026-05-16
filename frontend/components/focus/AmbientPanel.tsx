"use client";

import { useLocale, useTranslations } from "next-intl";

import { FOCUS_BG_OPTIONS, type FocusBgId } from "@/lib/data/focusBackgrounds";

interface AmbientPanelProps {
  value: FocusBgId;
  onChange: (id: FocusBgId) => void;
}

/**
 * 3×2 grid of ambient background buttons. Active option gets the accent
 * border + neon glow; other tiles stay dim until hovered. Labels are
 * picked up from the i18n namespace, falling back to the
 * `focusBackgrounds` table when a translation is missing.
 */
export function AmbientPanel({ value, onChange }: AmbientPanelProps) {
  const t = useTranslations("focus.solo.ambientPanel");
  const locale = useLocale() as "en" | "zh-TW";
  return (
    <div
      data-testid="ambient-panel"
      className="pixel-panel"
      style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}
    >
      <span
        className="font-silkscreen"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontSize: 10,
          color: "var(--accent)",
          letterSpacing: "0.2em",
        }}
      >
        <span
          aria-hidden
          className="animate-blinkSoft"
          style={{
            width: 6,
            height: 6,
            background: "var(--accent)",
            boxShadow: "var(--neon-glow)",
          }}
        />
        {t("header")}
      </span>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 6,
        }}
      >
        {FOCUS_BG_OPTIONS.map((opt) => {
          const isActive = opt.id === value;
          const label = opt.labels[locale] ?? opt.labels.en;
          return (
            <button
              key={opt.id}
              type="button"
              data-testid={`ambient-pick-${opt.id}`}
              data-active={isActive ? "true" : "false"}
              onClick={() => onChange(opt.id)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                padding: "8px 4px",
                background: isActive ? "var(--accent)" : "rgba(0,0,0,0.3)",
                color: isActive ? "#0a0524" : "var(--ink-mute)",
                border: `1px solid ${isActive ? "var(--accent)" : "var(--panel-stroke)"}`,
                cursor: "pointer",
                transition: "background 0.15s, border-color 0.15s",
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>{opt.emoji}</span>
              <span
                className="font-silkscreen"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.1em",
                }}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

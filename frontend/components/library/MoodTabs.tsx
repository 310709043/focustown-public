"use client";

import { useTranslations } from "next-intl";

export const MOOD_KEYS = ["all", "lofi", "jazz", "rain", "ambient"] as const;

export type MoodKey = (typeof MOOD_KEYS)[number];

// Back-compat export: existing consumers (UploadForm, MusicPanel) iterate
// MOODS to render selectable options. The `label` field is filled in at the
// call-site via useTranslations now; we keep the shape but mark the label
// optional so non-translated callers (e.g. tests) still type-check.
export const MOODS: ReadonlyArray<{ key: MoodKey }> = MOOD_KEYS.map((key) => ({ key }));

interface Props {
  value: MoodKey;
  onChange: (key: MoodKey) => void;
}

/**
 * Mood filter row for `/town/library` — pixel-tab pattern matching
 * Page 2's `TabBar` (accent fill + dark ink active, transparent inactive).
 * SRP: filter UI only, no state coupling.
 */
export function MoodTabs({ value, onChange }: Props) {
  const t = useTranslations("library.moods");
  return (
    <div
      data-testid="library-mood-tabs"
      style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
    >
      {MOOD_KEYS.map((key) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            data-active={active || undefined}
            className="font-silkscreen"
            style={{
              padding: "5px 11px",
              fontSize: 10,
              background: active ? "var(--accent)" : "rgba(0,0,0,0.3)",
              color: active ? "#0a0524" : "var(--ink-mute)",
              border: `1px solid ${active ? "var(--accent)" : "var(--panel-stroke)"}`,
              letterSpacing: "0.12em",
              cursor: "pointer",
            }}
          >
            #{t(key)}
          </button>
        );
      })}
    </div>
  );
}

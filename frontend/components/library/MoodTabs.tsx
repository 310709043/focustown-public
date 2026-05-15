"use client";

import { useTranslations } from "next-intl";
import { clsx } from "clsx";

export const MOOD_KEYS = ["all", "lofi", "jazz", "rain", "ambient"] as const;

export type MoodKey = (typeof MOOD_KEYS)[number];

// Back-compat export: existing consumers (UploadForm, MusicPanel) iterate
// MOODS to render selectable options. The `label` field is filled in at the
// call-site via useTranslations now; we keep the shape but mark the label
// optional so non-translated callers (e.g. tests) still type-check.
export const MOODS: ReadonlyArray<{ key: MoodKey }> = MOOD_KEYS.map((key) => ({ key }));

type Props = {
  value: MoodKey;
  onChange: (key: MoodKey) => void;
  className?: string;
};

export function MoodTabs({ value, onChange, className }: Props) {
  const t = useTranslations("library.moods");
  return (
    <div className={clsx("flex flex-wrap gap-1.5 md:gap-1", className)}>
      {MOOD_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={clsx(
            "text-[10px] px-2.5 py-1.5 touch:py-2 touch:min-h-[36px] md:py-0.5 md:px-2 rounded-full border transition-colors",
            value === key
              ? "border-accent-1 text-accent-1"
              : "border-border text-muted hover:border-accent-1/60 active:border-accent-1/60",
          )}
        >
          {t(key)}
        </button>
      ))}
    </div>
  );
}

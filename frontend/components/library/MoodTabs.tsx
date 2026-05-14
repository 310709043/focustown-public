"use client";

import { clsx } from "clsx";

export const MOODS = [
  { key: "all", label: "全部" },
  { key: "lofi", label: "lofi" },
  { key: "jazz", label: "jazz" },
  { key: "rain", label: "🌧 rain" },
  { key: "ambient", label: "ambient" },
] as const;

export type MoodKey = (typeof MOODS)[number]["key"];

type Props = {
  value: MoodKey;
  onChange: (key: MoodKey) => void;
  className?: string;
};

export function MoodTabs({ value, onChange, className }: Props) {
  return (
    <div className={clsx("flex flex-wrap gap-1", className)}>
      {MOODS.map((m) => (
        <button
          key={m.key}
          type="button"
          onClick={() => onChange(m.key)}
          className={clsx(
            "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
            value === m.key
              ? "border-accent-1 text-accent-1"
              : "border-border text-muted hover:border-accent-1/60",
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

"use client";

import { useLocale } from "next-intl";

import { INTEREST_OPTIONS, type Locale } from "@/lib/data/profileOptions";

import { ToggleChip } from "./ToggleChip";

interface InterestChipsProps {
  value: readonly string[];
  onToggle: (key: string) => void;
}

/**
 * 18 interest chips, multi-select with emoji prefixes. Active chips
 * fill with `--accent` (purple); inactive chips read as muted.
 */
export function InterestChips({ value, onToggle }: InterestChipsProps) {
  const locale = useLocale() as Locale;
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        marginTop: 8,
      }}
    >
      {INTEREST_OPTIONS.map((o) => (
        <ToggleChip
          key={o.key}
          active={value.includes(o.key)}
          onClick={() => onToggle(o.key)}
        >
          <span style={{ marginRight: 6 }}>{o.emoji}</span>
          {o.labels[locale] ?? o.labels.en}
        </ToggleChip>
      ))}
    </div>
  );
}

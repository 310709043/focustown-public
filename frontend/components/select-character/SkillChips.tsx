"use client";

import { useLocale } from "next-intl";

import { SKILL_OPTIONS, type Locale } from "@/lib/data/profileOptions";

import { ToggleChip } from "./ToggleChip";

interface SkillChipsProps {
  value: readonly string[];
  onToggle: (key: string) => void;
}

/**
 * 16 skill chips. Same shape as `InterestChips` but uses `accent-3`
 * (cyan) for the active state, mirroring reference's color divergence
 * between interests (purple) and skills (cyan).
 */
export function SkillChips({ value, onToggle }: SkillChipsProps) {
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
      {SKILL_OPTIONS.map((o) => (
        <ToggleChip
          key={o.key}
          active={value.includes(o.key)}
          onClick={() => onToggle(o.key)}
          color="var(--accent-3)"
        >
          {o.labels[locale] ?? o.labels.en}
        </ToggleChip>
      ))}
    </div>
  );
}

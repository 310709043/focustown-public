"use client";

import { useTranslations } from "next-intl";

import { DAILY_GOALS, type DailyGoal } from "@/lib/data/profileOptions";

interface DailyGoalRadioProps {
  value: DailyGoal;
  onChange: (next: DailyGoal) => void;
}

/**
 * Four-button radio for daily focus-session goal (2/4/6/8 🍅). The
 * subtitle line computes the equivalent minutes inline so the user
 * can sanity-check what each preset translates to.
 */
export function DailyGoalRadio({ value, onChange }: DailyGoalRadioProps) {
  const t = useTranslations("characters.selectPage");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {DAILY_GOALS.map((n) => (
          <button
            key={n}
            type="button"
            data-testid={`daily-goal-${n}`}
            data-active={value === n || undefined}
            onClick={() => onChange(n)}
            className={value === n ? "pixel-btn primary" : "pixel-btn"}
            style={{
              flex: 1,
              padding: "8px 0",
              fontSize: 11,
            }}
          >
            {n} 🍅
          </button>
        ))}
      </div>
      <div
        className="font-silkscreen"
        style={{ fontSize: 9, color: "var(--ink-dim)" }}
      >
        {value} × 25 min = {value * 25} min/{t("dailyGoal")}
      </div>
    </div>
  );
}

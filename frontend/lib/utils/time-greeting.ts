/**
 * Maps the current client-side hour to a coarse time-of-day "period",
 * used to pick i18n message keys like ``match.greeting.{period}.title``.
 *
 * Boundaries are conservative (5 / 12 / 17 / 20) — late-night sessions
 * up to 4:59 a.m. still read as "night" so a 2 a.m. user does not see
 * "good morning" before sunrise.
 */
export type Period = "morning" | "afternoon" | "evening" | "night";

export function currentPeriod(now: Date = new Date()): Period {
  const h = now.getHours();
  if (h < 5) return "night";
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  if (h < 20) return "evening";
  return "night";
}

/**
 * Facts the LowBatteryTown policy pages state. Keep the numbers in step
 * with the backend: LBT_GUEST_TOKEN_TTL_HOURS, the 24 h Redis TTL on
 * closed conversations, LBT_REPORT_RETENTION_DAYS and the pair block
 * after a report.
 */
export const LBT_LEGAL = {
  effectiveDate: "2026-10-04",
  contactEmail: process.env.NEXT_PUBLIC_LBT_CONTACT_EMAIL || "hello@lowbatterytown.com",
  tokenHours: 24,
  chatHours: 24,
  reportDays: 180,
  pairBlockHours: 24,
  /** LBT_FEEDBACK_RETENTION_DAYS in edge/wrangler.jsonc and backend settings. */
  feedbackDays: 365,
} as const;

const FACTS: Record<string, string> = {
  tokenHours: String(LBT_LEGAL.tokenHours),
  chatHours: String(LBT_LEGAL.chatHours),
  reportDays: String(LBT_LEGAL.reportDays),
  pairBlockHours: String(LBT_LEGAL.pairBlockHours),
  feedbackDays: String(LBT_LEGAL.feedbackDays),
};

/**
 * Fill `{name}` placeholders in policy and guide copy from LBT_LEGAL, so the
 * numbers live in one place. The copy is ours, not user input.
 */
export function fillLegalFacts(text: string): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => FACTS[key] ?? match);
}

export const POLICY_SLUGS = ["privacy", "terms", "guidelines"] as const;
export type PolicySlug = (typeof POLICY_SLUGS)[number];

export function isPolicySlug(value: string): value is PolicySlug {
  return (POLICY_SLUGS as readonly string[]).includes(value);
}

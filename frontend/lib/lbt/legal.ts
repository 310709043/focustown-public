/**
 * Facts the LowBatteryTown policy pages state. Keep the numbers in step
 * with the Cloudflare API: LBT_GUEST_TOKEN_TTL_HOURS and
 * LBT_REPORT_RETENTION_DAYS. Ordinary ended chats are deleted immediately.
 */
export const LBT_LEGAL = {
  effectiveDate: "2026-10-04",
  contactEmail: process.env.NEXT_PUBLIC_LBT_CONTACT_EMAIL || "hello@lowbatterytown.com",
  tokenHours: 24,
  reportDays: 180,
} as const;

export const POLICY_SLUGS = ["privacy", "terms", "guidelines"] as const;
export type PolicySlug = (typeof POLICY_SLUGS)[number];

export function isPolicySlug(value: string): value is PolicySlug {
  return (POLICY_SLUGS as readonly string[]).includes(value);
}

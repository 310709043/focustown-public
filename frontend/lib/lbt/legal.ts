import { POND_OFFER, POND_ON_SALE } from "./pond";

/**
 * Facts the LowBatteryTown policy pages state. Keep the numbers in step
 * with the Cloudflare API: LBT_GUEST_TOKEN_TTL_HOURS and
 * LBT_REPORT_RETENTION_DAYS. Ordinary ended chats are deleted immediately.
 */
export const LBT_LEGAL = {
  effectiveDate: "2026-10-15",
  contactEmail: process.env.NEXT_PUBLIC_LBT_CONTACT_EMAIL || "hello@lowbatterytown.com",
  tokenHours: 24,
  reportDays: 180,
  pairBlockHours: 24,
  suspensionHours: 24,
  suspensionDays: 7,
  /** LBT_FEEDBACK_RETENTION_DAYS in edge/wrangler.jsonc and backend settings. */
  feedbackDays: 30,
} as const;

const FACTS: Record<string, string> = {
  tokenHours: String(LBT_LEGAL.tokenHours),
  reportDays: String(LBT_LEGAL.reportDays),
  pairBlockHours: String(LBT_LEGAL.pairBlockHours),
  suspensionHours: String(LBT_LEGAL.suspensionHours),
  suspensionDays: String(LBT_LEGAL.suspensionDays),
  feedbackDays: String(LBT_LEGAL.feedbackDays),
  pondPrice: String(POND_OFFER.priceUsd),
  pondDevices: String(POND_OFFER.devices),
  pondCodeHours: String(POND_OFFER.codeHours),
  pondRefundDays: String(POND_OFFER.refundDays),
};

/**
 * Fill `{name}` placeholders in policy and guide copy from LBT_LEGAL, so the
 * numbers live in one place. The copy is ours, not user input.
 */
export function fillLegalFacts(text: string): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => FACTS[key] ?? match);
}

/** Policy sections marked `pond` describe the paid koi pond and appear only while it is on sale. */
export function policySections<T extends { pond?: boolean }>(sections: T[], pondOnSale: boolean = POND_ON_SALE): T[] {
  return sections.filter((section) => !section.pond || pondOnSale);
}

export const POLICY_SLUGS = ["privacy", "terms", "guidelines"] as const;
export type PolicySlug = (typeof POLICY_SLUGS)[number];

export function isPolicySlug(value: string): value is PolicySlug {
  return (POLICY_SLUGS as readonly string[]).includes(value);
}

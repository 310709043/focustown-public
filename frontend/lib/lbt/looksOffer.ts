/**
 * The paid looks besides the koi pond (lib/lbt/looks.ts) and their offer.
 * Plain constants, safe for server components (the /unlock page, the
 * policies). On sale once LOOKS_PURCHASE_URL is set: one Buy Me a Coffee
 * extra where the buyer names the look; launching also needs
 * LBT_LEGAL.effectiveDate bumped, since the terms gain a section.
 */
import type { UnlockItem } from "./unlocks";

export const LOOKS_PURCHASE_URL: string | null = null;
export const LOOKS_ON_SALE = LOOKS_PURCHASE_URL !== null;

export const LOOKS_OFFER = {
  /** Owner's price per look, 2026-11-14. */
  priceUsd: 3,
  /** DEFAULT_MAX_DEVICES in edge/src/unlocks.ts. */
  devices: 3,
  codeHours: 24,
  refundDays: 7,
} as const;

export const STYLES = ["milktea", "mint", "sakura", "pixel"] as const;
export type StyleId = (typeof STYLES)[number];
export const STYLE_ITEM: Record<StyleId, UnlockItem> = {
  milktea: "style-milktea",
  mint: "style-mint",
  sakura: "style-sakura",
  pixel: "style-pixel",
};
export const RAIN_ITEM: UnlockItem = "rain-town";


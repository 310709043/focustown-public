/**
 * 下雨的小鎮 offer: a paid look for the home street (components/lbt/RainScene.tsx).
 * Not on sale yet: RAIN_PURCHASE_URL stays null until the owner sets up the
 * purchase, and until then the look is only reachable in a dev build with
 * ?rain=1 (lib/lbt/stylePreview.ts).
 */
export const RAIN_PURCHASE_URL: string | null = null;
export const RAIN_ON_SALE = RAIN_PURCHASE_URL !== null;

export const RAIN_OFFER = {
  /** Owner's price, 2026-11-14. */
  priceUsd: 3,
} as const;

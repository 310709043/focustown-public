/** Google AdSense configuration.
 *
 *  All ad rendering is gated behind `ADSENSE_PUB_ID` — when the env var
 *  is empty or missing, `isAdsEnabled()` returns false and every ad
 *  component renders null. This lets the codebase carry the ad
 *  infrastructure without any visible change until the AdSense account
 *  is approved and the publisher ID is configured.
 *
 *  To activate:
 *    1. Get approved at https://www.google.com/adsense
 *    2. Set NEXT_PUBLIC_ADSENSE_PUB_ID=ca-pub-XXXXXXXXXXXXXXXX in CI
 *    3. Create ad units in AdSense dashboard, copy the slot IDs below
 */

export const ADSENSE_PUB_ID =
  process.env.NEXT_PUBLIC_ADSENSE_PUB_ID ?? "";

export function isAdsEnabled(): boolean {
  return ADSENSE_PUB_ID.length > 0;
}

/** Pre-defined ad slot IDs — replace with real values from the AdSense
 *  dashboard once the account is approved. Each slot corresponds to a
 *  specific placement in the UI. */
export const AD_SLOTS = {
  /** Horizontal banner below login form on the landing page. */
  loginBanner: process.env.NEXT_PUBLIC_AD_SLOT_LOGIN_BANNER ?? "",
  /** Leaderboard banner at the bottom of the town page. */
  townBottom: process.env.NEXT_PUBLIC_AD_SLOT_TOWN_BOTTOM ?? "",
  /** Rectangle shown after a focus session completes. */
  sessionComplete: process.env.NEXT_PUBLIC_AD_SLOT_SESSION_COMPLETE ?? "",
} as const;

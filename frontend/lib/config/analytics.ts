/** Google Analytics 4 configuration.
 *
 *  Gated behind `NEXT_PUBLIC_GA_ID` — when the env var is empty or missing,
 *  `isAnalyticsEnabled()` returns false and no tracking scripts are loaded.
 *
 *  To activate:
 *    1. Create a GA4 property at https://analytics.google.com
 *    2. Set NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX in CI vars (and Dockerfile ARG)
 */

export const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? "";

export function isAnalyticsEnabled(): boolean {
  return GA_ID.length > 0;
}

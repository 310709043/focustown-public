"use client";

import Script from "next/script";
import { GA_ID, isAnalyticsEnabled } from "@/lib/config/analytics";
import { analyticsInitScript } from "@/lib/config/analyticsScript.mjs";

/** Loads the Google Analytics 4 gtag.js script globally.
 *  Mount in the root layout — renders nothing when analytics are disabled. */
export function GoogleAnalytics() {
  if (!isAnalyticsEnabled()) return null;

  return (
    <>
      <Script
        id="ga-lib"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {analyticsInitScript(GA_ID)}
      </Script>
    </>
  );
}

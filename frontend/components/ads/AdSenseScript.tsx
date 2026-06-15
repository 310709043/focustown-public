"use client";

import Script from "next/script";
import { ADSENSE_PUB_ID, isAdsEnabled } from "@/lib/config/ads";

/** Loads the Google AdSense library script once, globally.
 *  Mount in the root layout — renders nothing when ads are disabled. */
export function AdSenseScript() {
  if (!isAdsEnabled()) return null;

  return (
    <Script
      id="adsense-lib"
      async
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_PUB_ID}`}
      crossOrigin="anonymous"
      strategy="afterInteractive"
    />
  );
}

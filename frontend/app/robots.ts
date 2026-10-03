import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/lbt/site";

// /_next/ stays crawlable: Google renders pages with their CSS and JS.
// Non-indexed routes (demo, legacy Focus Town) carry `noindex` instead of a
// Disallow, because a blocked page's noindex is never seen.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

import { CF_ANALYTICS_SCRIPT } from "@/lib/security/lbtCsp";

/**
 * Cloudflare Web Analytics: page views and Core Web Vitals, no cookies, no
 * cross-site tracking, nothing about who the visitor is (the privacy page
 * says so). Renders nothing until NEXT_PUBLIC_CF_BEACON_TOKEN holds the
 * site token from the Cloudflare dashboard. In production the edge stamps
 * this tag with the page's CSP nonce.
 */
const TOKEN = (process.env.NEXT_PUBLIC_CF_BEACON_TOKEN ?? "").trim();

export function CloudflareAnalytics() {
  if (!/^[0-9a-f]{32}$/i.test(TOKEN)) return null;
  return (
    <script
      defer
      src={`${CF_ANALYTICS_SCRIPT}/beacon.min.js`}
      data-cf-beacon={JSON.stringify({ token: TOKEN })}
    />
  );
}

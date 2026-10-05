/**
 * The public origin of the site. Canonicals, hreflang, the sitemap and
 * structured data all build absolute URLs from this, so it must be the
 * host that serves pages: the apex 301s to www.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.lowbatterytown.com"
).replace(/\/+$/, "");

export const BRAND = "LowBatteryTown";
export const BRAND_ZH = "低電量小鎮";

/** Date the indexed pages last changed in substance (sitemap lastmod). */
export const CONTENT_UPDATED = "2026-10-05";

/** JSON for an inline <script type="application/ld+json">, safe against `</script>`. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

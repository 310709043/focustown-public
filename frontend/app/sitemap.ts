import type { MetadataRoute } from "next";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://lowbatterytown.com";

const locales = ["zh-TW", "en"] as const;

// Only the LowBatteryTown home is indexed. The original Focus Town routes
// (town, awards, legal, sign-in) are served with `noindex` — see
// app/[locale]/(legacy)/layout.tsx — so they stay out of the sitemap too.
const pages = [{ path: "", priority: 1.0, changeFrequency: "weekly" as const }];

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];
  for (const page of pages) {
    for (const locale of locales) {
      entries.push({
        url: `${siteUrl}/${locale}${page.path}`,
        lastModified: new Date(),
        changeFrequency: page.changeFrequency,
        priority: page.priority,
        alternates: {
          languages: Object.fromEntries(
            locales.map((l) => [l, `${siteUrl}/${l}${page.path}`]),
          ),
        },
      });
    }
  }
  return entries;
}

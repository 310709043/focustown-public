import type { MetadataRoute } from "next";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://lowbatterytown.com";

const locales = ["zh-TW", "en"] as const;

const pages = [
  { path: "", priority: 1.0, changeFrequency: "weekly" as const },
  { path: "/town", priority: 0.9, changeFrequency: "daily" as const },
  { path: "/legal/terms", priority: 0.3, changeFrequency: "monthly" as const },
  { path: "/legal/privacy", priority: 0.3, changeFrequency: "monthly" as const },
];

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

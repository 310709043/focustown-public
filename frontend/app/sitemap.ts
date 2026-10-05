import type { MetadataRoute } from "next";

import { routing } from "@/i18n/routing";
import { ARTICLES } from "@/lib/lbt/articles";
import { LBT_LEGAL, POLICY_SLUGS } from "@/lib/lbt/legal";
import { CONTENT_UPDATED, SITE_URL } from "@/lib/lbt/site";

// Only the LowBatteryTown home, its guide and articles, and its policies are indexed. The original
// Focus Town routes (town, awards, legal, sign-in) and /demo are served with
// `noindex` — see app/[locale]/(legacy)/layout.tsx — so they stay out too.
const pages = [
  { path: "", priority: 1.0, changeFrequency: "weekly" as const, lastModified: CONTENT_UPDATED },
  { path: "/guide", priority: 0.7, changeFrequency: "monthly" as const, lastModified: CONTENT_UPDATED },
  ...ARTICLES.map((article) => ({
    path: `/guide/${article.slug}`,
    priority: 0.6,
    changeFrequency: "monthly" as const,
    lastModified: article.updated,
  })),
  ...POLICY_SLUGS.map((slug) => ({
    path: `/policies/${slug}`,
    priority: 0.3,
    changeFrequency: "yearly" as const,
    lastModified: LBT_LEGAL.effectiveDate,
  })),
];

export default function sitemap(): MetadataRoute.Sitemap {
  return pages.flatMap((page) =>
    routing.locales.map((locale) => ({
      url: `${SITE_URL}/${locale}${page.path}`,
      lastModified: page.lastModified,
      changeFrequency: page.changeFrequency,
      priority: page.priority,
      alternates: {
        languages: {
          ...Object.fromEntries(routing.locales.map((l) => [l, `${SITE_URL}/${l}${page.path}`])),
          "x-default": `${SITE_URL}/${routing.defaultLocale}${page.path}`,
        },
      },
    })),
  );
}

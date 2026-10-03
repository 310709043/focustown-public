import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PolicyPage } from "@/components/lbt/PolicyPage";
import { routing } from "@/i18n/routing";
import { isPolicySlug, POLICY_SLUGS } from "@/lib/lbt/legal";
import { BRAND } from "@/lib/lbt/site";

type Params = Promise<{ locale: string; slug: string }>;

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => POLICY_SLUGS.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isPolicySlug(slug)) return {};
  const t = await getTranslations({ locale, namespace: "lbt.policy" });
  const path = `/${locale}/policies/${slug}`;
  const title = t(`${slug}.title`);
  const description = t(`${slug}.intro`);
  return {
    title,
    description,
    alternates: {
      canonical: path,
      languages: {
        ...Object.fromEntries(routing.locales.map((l) => [l, `/${l}/policies/${slug}`])),
        "x-default": `/${routing.defaultLocale}/policies/${slug}`,
      },
    },
    // Restated in full: Next replaces, not merges, the layout's openGraph.
    openGraph: {
      type: "article",
      siteName: BRAND,
      url: path,
      title,
      description,
      images: [{ url: "/brand/og-lbt.png", width: 1200, height: 630 }],
    },
  };
}

export default async function Page({ params }: { params: Params }) {
  const { locale, slug } = await params;
  if (!isPolicySlug(slug)) notFound();
  setRequestLocale(locale);
  return <PolicyPage locale={locale} slug={slug} />;
}

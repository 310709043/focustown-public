import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PolicyPage } from "@/components/lbt/PolicyPage";
import { routing } from "@/i18n/routing";
import { isPolicySlug, POLICY_SLUGS } from "@/lib/lbt/legal";

type Params = Promise<{ locale: string; slug: string }>;

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => POLICY_SLUGS.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isPolicySlug(slug)) return {};
  const t = await getTranslations({ locale, namespace: "lbt.policy" });
  return {
    title: t(`${slug}.title`),
    description: t(`${slug}.intro`),
    alternates: {
      canonical: `/${locale}/policies/${slug}`,
      languages: Object.fromEntries(
        routing.locales.map((l) => [l, `/${l}/policies/${slug}`]),
      ),
    },
  };
}

export default async function Page({ params }: { params: Params }) {
  const { locale, slug } = await params;
  if (!isPolicySlug(slug)) notFound();
  setRequestLocale(locale);
  return <PolicyPage locale={locale} slug={slug} />;
}

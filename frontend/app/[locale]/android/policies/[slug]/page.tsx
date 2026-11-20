import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { PolicyPage } from "@/components/lbt/PolicyPage";
import { routing } from "@/i18n/routing";
import { isPolicySlug, POLICY_SLUGS } from "@/lib/lbt/legal";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => POLICY_SLUGS.map((slug) => ({ locale, slug })));
}

export default async function AndroidPolicyPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  if (!isPolicySlug(slug)) notFound();
  setRequestLocale(locale);
  return <PolicyPage locale={locale} slug={slug} android />;
}

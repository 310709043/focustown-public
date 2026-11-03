import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { LbtApp } from "@/components/lbt/LbtApp";
import { lbtFontVariables } from "@/lib/lbtFonts";
import { demoEnabled } from "@/lib/lbt/demoAccess";

/** The labelled demo script (no backend). Kept out of search results. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DemoPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  if (!demoEnabled()) notFound();
  const { locale } = await params;
  setRequestLocale(locale);
  return <LbtApp fontClassName={lbtFontVariables} mode="demo" />;
}

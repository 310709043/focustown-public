import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { LbtApp } from "@/components/lbt/LbtApp";
import { lbtFontVariables } from "@/lib/lbtFonts";

/** The labelled demo script (no backend). Kept out of search results. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DemoPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LbtApp fontClassName={lbtFontVariables} mode="demo" />;
}

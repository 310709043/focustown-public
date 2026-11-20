import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { LbtApp } from "@/components/lbt/LbtApp";
import { lbtFontVariables } from "@/lib/lbtFonts";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AndroidPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LbtApp android fontClassName={lbtFontVariables} />;
}

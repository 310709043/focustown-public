import { setRequestLocale } from "next-intl/server";

import { LbtApp } from "@/components/lbt/LbtApp";
import { lbtFontVariables } from "@/lib/lbtFonts";

/**
 * LowBatteryTown home: pairs real people through the chat API (live
 * transport). The scripted, labelled partner lives at /demo.
 */
export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LbtApp fontClassName={lbtFontVariables} />;
}

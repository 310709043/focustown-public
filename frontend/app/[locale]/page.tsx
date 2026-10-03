import { setRequestLocale } from "next-intl/server";

import { LbtApp } from "@/components/lbt/LbtApp";
import { lbtFontVariables } from "@/lib/lbtFonts";

/**
 * LowBatteryTown home. The experience is a simulated prototype — see
 * components/lbt/LbtApp.tsx — and needs no account or backend.
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

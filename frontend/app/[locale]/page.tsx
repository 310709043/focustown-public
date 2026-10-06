import { getTranslations, setRequestLocale } from "next-intl/server";

import { LbtApp } from "@/components/lbt/LbtApp";
import { BRAND, BRAND_ALIASES, jsonLd, SITE_URL } from "@/lib/lbt/site";
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
  const t = await getTranslations({ locale, namespace: "lbt.meta" });
  return (
    <>
      {/* The chat itself as a free web application (no ratings or counts: none are claimed). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: BRAND,
            alternateName: BRAND_ALIASES,
            url: `${SITE_URL}/${locale}`,
            description: t("description"),
            inLanguage: locale,
            applicationCategory: "SocialNetworkingApplication",
            operatingSystem: "Any (web browser)",
            browserRequirements: "Requires JavaScript",
            isAccessibleForFree: true,
            offers: { "@type": "Offer", price: "0", priceCurrency: "TWD" },
            audience: { "@type": "PeopleAudience", suggestedMinAge: 18 },
            publisher: { "@id": `${SITE_URL}/#org` },
          }),
        }}
      />
      <LbtApp fontClassName={lbtFontVariables} />
    </>
  );
}

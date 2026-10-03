import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";

import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { DirectionSync } from "@/components/chrome/DirectionSync";
import { routing, type Locale } from "@/i18n/routing";
import { BRAND, BRAND_ZH, jsonLd, SITE_URL } from "@/lib/lbt/site";

function isSupportedLocale(value: string): value is Locale {
  return (routing.locales as readonly string[]).includes(value);
}

const OG_LOCALE: Record<Locale, string> = {
  "zh-TW": "zh_TW",
  en: "en_US",
};


export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const safe = isSupportedLocale(locale) ? locale : routing.defaultLocale;
  const t = await getTranslations({ locale: safe, namespace: "lbt.meta" });

  const languages = Object.fromEntries(
    routing.locales.map((l) => [l, `/${l}`]),
  ) as Record<Locale, string>;

  const title = {
    default: t("title"),
    template: `%s | ${BRAND}`,
  };

  return {
    metadataBase: new URL(SITE_URL),
    applicationName: BRAND,
    title,
    description: t("description"),
    keywords: t("keywords")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean),
    authors: [{ name: BRAND }],
    creator: BRAND,
    alternates: {
      canonical: `/${safe}`,
      languages: {
        ...languages,
        "x-default": `/${routing.defaultLocale}`,
      },
    },
    openGraph: {
      type: "website",
      siteName: BRAND,
      url: `/${safe}`,
      title: t("title"),
      description: t("description"),
      locale: OG_LOCALE[safe],
      alternateLocale: routing.locales
        .filter((l) => l !== safe)
        .map((l) => OG_LOCALE[l]),
      images: [
        {
          url: "/brand/og-lbt.png",
          width: 1200,
          height: 630,
          alt: t("ogAlt"),
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: t("title"),
      description: t("description"),
      images: ["/brand/og-lbt.png"],
    },
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "48x48" },
        { url: "/brand/favicon.svg", type: "image/svg+xml" },
        { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      ],
      apple: "/brand/apple-touch-icon.png",
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * Locale shell: intl provider, structured data, `<html lang>` sync and
 * analytics only. Chrome that belongs to the original Focus Town pages
 * (CRT overlays, splash, audio, realtime) lives in `(legacy)/layout.tsx`.
 */
export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const messages = await getMessages();
  const t = await getTranslations({ locale, namespace: "lbt.meta" });

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {/* JSON-LD: the site and the organisation behind it (brand name + logo in results). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "WebSite",
                "@id": `${SITE_URL}/#website`,
                name: BRAND,
                alternateName: BRAND_ZH,
                url: `${SITE_URL}/${locale}`,
                description: t("description"),
                inLanguage: locale,
                publisher: { "@id": `${SITE_URL}/#org` },
              },
              {
                "@type": "Organization",
                "@id": `${SITE_URL}/#org`,
                name: BRAND,
                alternateName: BRAND_ZH,
                url: SITE_URL,
                logo: `${SITE_URL}/brand/icon-512.png`,
              },
            ],
          }),
        }}
      />
      <DirectionSync locale={locale} />
      <GoogleAnalytics />
      {children}
    </NextIntlClientProvider>
  );
}

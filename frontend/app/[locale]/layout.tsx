import "../globals.css";

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";

import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { DirectionSync } from "@/components/chrome/DirectionSync";
import { routing, type Locale } from "@/i18n/routing";
import { fontVariables } from "@/lib/fonts";
import { BRAND, BRAND_ALIASES, jsonLd, SITE_URL } from "@/lib/lbt/site";
import { TOWN_TIME_BOOT } from "@/lib/lbt/townTime";

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
    // Google Search Console ownership (URL-prefix property for www). Public token.
    verification: { google: "QuvCCXNukQD0XPg3g42ojiqZ_wLZ77n5yKKiRHdwuTA" },
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#141c31",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * Root layout for every localised page (the app has one root layout per
 * branch: this one and `(dev)/layout.tsx`, no `app/layout.tsx`). It owns
 * `<html lang={locale}>` so the server HTML already names the language,
 * plus the intl provider, structured data and analytics. Chrome that
 * belongs to the original Focus Town pages (CRT overlays, splash, audio,
 * realtime) lives in `(legacy)/layout.tsx`.
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
    // suppressHydrationWarning: the boot script below sets data-lbt-time /
    // data-lbt-week on <html> before React hydrates.
    <html lang={locale} className={fontVariables} suppressHydrationWarning>
      <head>
        {/* Static code, no user input: picks the town's time of day before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: TOWN_TIME_BOOT }} />
      </head>
      <body>
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
                    alternateName: BRAND_ALIASES,
                    url: SITE_URL,
                    description: t("description"),
                    inLanguage: locale,
                    publisher: { "@id": `${SITE_URL}/#org` },
                  },
                  {
                    "@type": "Organization",
                    "@id": `${SITE_URL}/#org`,
                    name: BRAND,
                    alternateName: BRAND_ALIASES,
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
      </body>
    </html>
  );
}
